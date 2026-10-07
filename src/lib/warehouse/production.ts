/**
 * PHI-safe production / collections aggregates from source ledger + procedures.
 * Never forwards patient_id or patient embeds on summary types.
 */

import {
  emptyCdtLookup,
  sortCategoryRows,
  type CdtLookup,
  type ProcedureVolumeBucket,
} from "@/lib/cdt/categories";
import {
  aggregateFinancingVendorMix,
  aggregatePaymentMix,
  emptyFinancingVendorMix,
  emptyPaymentMix,
  paymentCollectionCents,
  supplementInsurancePaymentMixFromClaims,
  type FinancingVendorMix,
  type PaymentClassificationOptions,
  type PaymentMix,
} from "@/lib/warehouse/payment-mix";
import {
  moneyToCents,
  type AdjustmentRecord,
  type ChargeRecord,
  type ClaimRecord,
  type PatientRecord,
  type PaymentRecord,
  type ProcedureRecord,
} from "@/lib/warehouse/types";
import { inYmdRange } from "@/lib/warehouse/conversion";
import {
  inferCategoryFromDescription,
  inferWarrantyBucket,
} from "@/lib/cdt/infer-procedure-category";
import {
  buildSoonerCarePatientSet,
  isScProductionCharge,
  isScChartDescription,
  resolveProcedureDescription,
  type PatientCarrierRecord,
} from "@/lib/warehouse/sc-production";
import {
  buildAdjustmentTypeMap,
  isWriteOffAdjustment,
  type AdjustmentTypeRecord,
} from "@/lib/warehouse/adjusted-production";
import { accumulateProcedureVolume } from "@/lib/warehouse/procedure-volume";

const PROCEDURE_MIX_TOP_N = 15;
const UNMAPPED_CODES_TOP_N = 20;

export type ProcedureMixRow = {
  code: string;
  name: string;
  count: number;
  productionCents: number;
};

export type CategoryProductionRow = {
  category: string;
  productionCents: number;
  count: number;
};

export type ProcedureVolume = Record<ProcedureVolumeBucket, number>;

export function emptyProcedureVolume(): ProcedureVolume {
  return {
    extractions: 0,
    implants: 0,
    aox: 0,
    dentures: 0,
    partials: 0,
    remakes: 0,
  };
}

export type DentureWarrantyMix = {
  m6Cents: number;
  y1Cents: number;
  y3Cents: number;
  y5Cents: number;
};

export function emptyDentureWarrantyMix(): DentureWarrantyMix {
  return { m6Cents: 0, y1Cents: 0, y3Cents: 0, y5Cents: 0 };
}

export type MonthlyProductionSeries = {
  label: string;
  year: number;
  months: number[];
};

/** Production inside the selected daily, monthly, or yearly window. */
export type PeriodTrendPoint = {
  label: string;
  dollars: number;
};

export type MonthlyCollectionPoint = {
  label: string;
  monthKey: string;
  cents: number;
  /** Production in the same bucket, limited to the selected window. */
  productionCents: number;
};

export type TreatmentByMonthRow = {
  label: string;
  monthKey: string;
  categories: Record<string, number>;
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type ProductionTotals = {
  grossProductionCents: number;
  /** Gross production tied to SoonerCare carrier or SC chart codes. */
  scProductionCents: number;
  collectionsCents: number;
  adjustmentsCents: number;
  netProductionCents: number;
  procedureCount: number;
  chargeCount: number;
  paymentCount: number;
  adjustmentCount: number;
};

export type ProviderProduction = ProductionTotals & {
  procedureMix: ProcedureMixRow[];
  procedureVolume: ProcedureVolume;
  productionByCategory: CategoryProductionRow[];
  /** 3-year monthly production for this provider (year-over-year chart). */
  monthlyProduction: MonthlyProductionSeries[];
  /** Trend limited to the selected daily, monthly, or yearly window. */
  periodTrend: PeriodTrendPoint[];
};

export type ProductionSummary = ProductionTotals & {
  available: boolean;
  procedureMix: ProcedureMixRow[];
  productionByCategory: CategoryProductionRow[];
  procedureVolume: ProcedureVolume;
  collectionRatio: number | null;
  uncategorizedProductionCents: number;
  /** Charges/procedures whose codes are not in the CDT cockpit chart. */
  unmappedCodes: ProcedureMixRow[];
  paymentMix: PaymentMix;
  financingVendorMix: FinancingVendorMix;
  monthlyProduction: MonthlyProductionSeries[];
  periodTrend: PeriodTrendPoint[];
  treatmentByMonth: TreatmentByMonthRow[];
  dentureWarranty: DentureWarrantyMix;
  partialWarranty: DentureWarrantyMix;
  monthlyCollections: MonthlyCollectionPoint[];
  byProvider: Map<number, ProviderProduction>;
  notices: string[];
};

function emptyTotals(): ProductionTotals {
  return {
    grossProductionCents: 0,
    scProductionCents: 0,
    collectionsCents: 0,
    adjustmentsCents: 0,
    netProductionCents: 0,
    procedureCount: 0,
    chargeCount: 0,
    paymentCount: 0,
    adjustmentCount: 0,
  };
}

function bumpScProduction(
  cdt: CdtLookup,
  soonerCarePatients: Set<number>,
  code: string,
  chargeName: string,
  patientId: number | null | undefined,
  cents: number,
  totals: ProductionTotals,
  byProvider: Map<number, ProviderProduction>,
  providerId: number | null | undefined,
): void {
  if (
    !isScProductionCharge({
      code,
      chargeName,
      patientId,
      soonerCarePatients,
      cdt,
    })
  ) {
    return;
  }
  totals.scProductionCents += cents;
  if (providerId != null) {
    ensureProvider(byProvider, providerId).scProductionCents += cents;
  }
}

function bumpProviderCategory(
  cdt: CdtLookup,
  prov: ProviderProduction,
  code: string,
  name: string,
  cents: number,
): void {
  let category = cdt.lookupCategory(code);
  if (!category && name.trim()) {
    category = inferCategoryFromDescription(name)?.category ?? null;
  }
  if (!category) return;
  let row = prov.productionByCategory.find((r) => r.category === category);
  if (!row) {
    row = { category, productionCents: 0, count: 0 };
    prov.productionByCategory.push(row);
  }
  row.productionCents += cents;
  row.count += 1;
}


function bumpWarrantyProduction(
  cdt: CdtLookup,
  code: string,
  chargeName: string,
  cents: number,
  dentureWarranty: DentureWarrantyMix,
  partialWarranty: DentureWarrantyMix,
): void {
  const description = resolveProcedureDescription(code, chargeName, cdt);
  if (isScChartDescription(description)) return;

  const bucket =
    cdt.lookupWarrantyBucket(code) ??
    inferWarrantyBucket(code, description);
  if (!bucket) return;

  let category = cdt.lookupCategory(code);
  if (!category && description.trim()) {
    category =
      inferCategoryFromDescription(description)?.category ?? null;
  }
  const target =
    category === "Partial Dentures"
      ? partialWarranty
      : category === "Dentures"
        ? dentureWarranty
        : null;
  if (!target) return;

  if (bucket === "m6") target.m6Cents += cents;
  else if (bucket === "y1") target.y1Cents += cents;
  else if (bucket === "y3") target.y3Cents += cents;
  else target.y5Cents += cents;
}

function monthKeyFromDate(date: string | null | undefined): string | null {
  if (!date) return null;
  return date.slice(0, 7);
}

function monthLabelFromKey(key: string): string {
  const [, mo] = key.split("-");
  const idx = Number.parseInt(mo, 10) - 1;
  return MONTH_LABELS[idx] ?? key;
}

/** Fixed calendar window for Production Trend (mockup: this year vs. two prior). */
export function productionTrendRange(now = new Date()): {
  fromYmd: string;
  toYmd: string;
} {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return {
    fromYmd: `${year - 2}-01-01`,
    toYmd: `${year}-${month}-${day}`,
  };
}

function collectTrendChargeDates(
  procedures: ProcedureRecord[],
  charges: ChargeRecord[],
  fromYmd: string,
  toYmd: string,
  chargesAvailable: boolean,
  proceduresAvailable: boolean,
  providerId?: number,
): { ymd: string; cents: number }[] {
  const matchesProvider = (id: number | null | undefined) =>
    providerId == null || id === providerId;
  const chargeDates: { ymd: string; cents: number }[] = [];
  const trendCharges = charges.filter(
    (c) =>
      !c.deleted_at &&
      c.charged_at &&
      inYmdRange(c.charged_at, fromYmd, toYmd),
  );

  if (chargesAvailable && trendCharges.length > 0) {
    for (const c of trendCharges) {
      if (!matchesProvider(c.provider_id)) continue;
      chargeDates.push({
        ymd: c.charged_at!.slice(0, 10),
        cents: moneyToCents(c.fee),
      });
    }
    if (chargeDates.length > 0 || !proceduresAvailable) return chargeDates;
  }

  if (!proceduresAvailable) return chargeDates;

  for (const p of procedures.filter(isActiveProcedure)) {
    if (!matchesProvider(p.provider_id)) continue;
    const date = p.start_date || p.end_date;
    if (!date || !inYmdRange(date, fromYmd, toYmd)) continue;
    chargeDates.push({ ymd: date.slice(0, 10), cents: moneyToCents(p.fee) });
  }
  return chargeDates;
}

function buildMonthlyProductionSeries(
  chargeDates: { ymd: string; cents: number }[],
): MonthlyProductionSeries[] {
  const now = new Date();
  const thisYear = now.getFullYear();
  const years = [thisYear - 2, thisYear - 1, thisYear];
  const byYearMonth = new Map<string, number>();

  for (const { ymd, cents } of chargeDates) {
    const key = ymd.slice(0, 7);
    byYearMonth.set(key, (byYearMonth.get(key) ?? 0) + cents);
  }

  return years.map((year) => ({
    label: String(year),
    year,
    months: Array.from({ length: 12 }, (_, mi) => {
      const key = `${year}-${String(mi + 1).padStart(2, "0")}`;
      return (byYearMonth.get(key) ?? 0) / 100;
    }),
  }));
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function enumerateMonths(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let year = Number(fromYmd.slice(0, 4));
  let month = Number(fromYmd.slice(5, 7));
  const endYear = Number(toYmd.slice(0, 4));
  const endMonth = Number(toYmd.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (out.length > 36) break;
  }
  return out;
}

function dayLabel(ymd: string): string {
  const month = monthLabelFromKey(ymd.slice(0, 7));
  return `${month} ${Number(ymd.slice(8, 10))}`;
}

export function buildPeriodTrendPoints(
  chargeDates: { ymd: string; cents: number }[],
  fromYmd: string,
  toYmd: string,
): PeriodTrendPoint[] {
  const byDay = new Map<string, number>();
  for (const row of chargeDates) {
    if (row.ymd < fromYmd || row.ymd > toYmd) continue;
    byDay.set(row.ymd, (byDay.get(row.ymd) ?? 0) + row.cents);
  }

  if (fromYmd.slice(0, 7) === toYmd.slice(0, 7)) {
    const points: PeriodTrendPoint[] = [];
    let cursor = fromYmd;
    while (cursor <= toYmd && points.length < 31) {
      points.push({
        label: fromYmd === toYmd ? dayLabel(cursor) : String(Number(cursor.slice(8, 10))),
        dollars: (byDay.get(cursor) ?? 0) / 100,
      });
      cursor = addDaysYmd(cursor, 1);
    }
    return points;
  }

  const byMonth = new Map<string, number>();
  for (const [ymd, cents] of byDay) {
    const key = ymd.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + cents);
  }
  const multiYear = fromYmd.slice(0, 4) !== toYmd.slice(0, 4);
  return enumerateMonths(fromYmd, toYmd).map((key) => ({
    label: multiYear
      ? `${monthLabelFromKey(key)} ${key.slice(2, 4)}`
      : monthLabelFromKey(key),
    dollars: (byMonth.get(key) ?? 0) / 100,
  }));
}

function buildTreatmentByMonth(
  entries: { monthKey: string; category: string; cents: number }[],
  fromYmd: string,
  toYmd: string,
): TreatmentByMonthRow[] {
  const byMonth = new Map<string, TreatmentByMonthRow>();
  for (const e of entries) {
    let row = byMonth.get(e.monthKey);
    if (!row) {
      row = {
        monthKey: e.monthKey,
        label: monthLabelFromKey(e.monthKey),
        categories: {},
      };
      byMonth.set(e.monthKey, row);
    }
    row.categories[e.category] =
      (row.categories[e.category] ?? 0) + e.cents / 100;
  }

  if (fromYmd === toYmd) {
    const monthKey = fromYmd.slice(0, 7);
    const row = byMonth.get(monthKey) ?? {
      monthKey,
      label: dayLabel(fromYmd),
      categories: {},
    };
    return [{ ...row, label: dayLabel(fromYmd) }];
  }

  return enumerateMonths(fromYmd, toYmd).map(
    (monthKey) =>
      byMonth.get(monthKey) ?? {
        monthKey,
        label: monthLabelFromKey(monthKey),
        categories: {},
      },
  );
}

function buildMonthlyCollections(
  payments: PaymentRecord[],
  chargeDates: { ymd: string; cents: number }[],
  fromYmd: string,
  toYmd: string,
): MonthlyCollectionPoint[] {
  const productionByMonth = new Map<string, number>();
  let productionTotal = 0;
  for (const row of chargeDates) {
    if (row.ymd < fromYmd || row.ymd > toYmd) continue;
    productionTotal += row.cents;
    const key = row.ymd.slice(0, 7);
    productionByMonth.set(key, (productionByMonth.get(key) ?? 0) + row.cents);
  }

  if (fromYmd === toYmd) {
    let cents = 0;
    for (const p of payments) {
      const raw = moneyToCents(p.payment_amount);
      if (raw <= 0) continue;
      cents += raw;
    }
    return [
      {
        label: dayLabel(fromYmd),
        monthKey: fromYmd.slice(0, 7),
        cents,
        productionCents: productionTotal,
      },
    ];
  }

  const byMonth = new Map<string, number>();
  for (const p of payments) {
    const key = monthKeyFromDate(p.paid_at);
    if (!key) continue;
    const cents = moneyToCents(p.payment_amount);
    if (cents <= 0) continue;
    byMonth.set(key, (byMonth.get(key) ?? 0) + cents);
  }
  return enumerateMonths(fromYmd, toYmd).map((monthKey) => ({
    monthKey,
    label: monthLabelFromKey(monthKey),
    cents: byMonth.get(monthKey) ?? 0,
    productionCents: productionByMonth.get(monthKey) ?? 0,
  }));
}

function ensureProvider(
  map: Map<number, ProviderProduction>,
  providerId: number,
): ProviderProduction {
  let row = map.get(providerId);
  if (!row) {
    row = emptyProviderProduction();
    map.set(providerId, row);
  }
  return row;
}

function bumpMix(
  map: Map<string, ProcedureMixRow>,
  code: string,
  name: string,
  cents: number,
): void {
  const key = code || "UNKNOWN";
  let row = map.get(key);
  if (!row) {
    row = { code: key, name: name || key, count: 0, productionCents: 0 };
    map.set(key, row);
  }
  row.count += 1;
  row.productionCents += cents;
  if (name && row.name === key) row.name = name;
}

function sortMixTop(
  map: Map<string, ProcedureMixRow>,
  limit: number,
): ProcedureMixRow[] {
  return [...map.values()]
    .sort(
      (a, b) =>
        b.productionCents - a.productionCents ||
        b.count - a.count ||
        a.code.localeCompare(b.code),
    )
    .slice(0, limit);
}

function sortMix(map: Map<string, ProcedureMixRow>): ProcedureMixRow[] {
  return sortMixTop(map, PROCEDURE_MIX_TOP_N);
}

function bumpCategory(
  cdt: CdtLookup,
  map: Map<string, CategoryProductionRow>,
  code: string,
  name: string,
  cents: number,
  unmapped: Map<string, ProcedureMixRow>,
): void {
  let category = cdt.lookupCategory(code);
  if (!category && name.trim()) {
    category = inferCategoryFromDescription(name)?.category ?? null;
  }
  if (category) {
    let row = map.get(category);
    if (!row) {
      row = { category, productionCents: 0, count: 0 };
      map.set(category, row);
    }
    row.productionCents += cents;
    row.count += 1;
  } else if (code && code !== "UNKNOWN") {
    bumpMix(unmapped, code, name, cents);
  }
}

function finalize(t: ProductionTotals): void {
  t.netProductionCents = t.grossProductionCents - t.adjustmentsCents;
}

function filterProceduresInRange(
  procedures: ProcedureRecord[],
  fromYmd: string,
  toYmd: string,
): ProcedureRecord[] {
  return procedures.filter((p) => {
    const date = p.start_date || p.end_date;
    return date && inYmdRange(date, fromYmd, toYmd);
  });
}

function isActiveProcedure(p: ProcedureRecord): boolean {
  if (!p.status) return true;
  return p.status === "completed" || p.status === "scheduled";
}

/**
 * Aggregate production KPIs from already-fetched ledger rows (source or Mongo warehouse).
 */
export function summarizeProductionFromLedger(params: {
  fromYmd: string;
  toYmd: string;
  procedures: ProcedureRecord[];
  charges: ChargeRecord[];
  payments: PaymentRecord[];
  adjustments: AdjustmentRecord[];
  patients?: Array<PatientRecord | PatientCarrierRecord>;
  notices?: string[];
  proceduresAvailable?: boolean;
  chargesAvailable?: boolean;
  paymentsAvailable?: boolean;
  adjustmentsAvailable?: boolean;
  cdt?: CdtLookup;
  adjustmentTypes?: AdjustmentTypeRecord[];
  claims?: ClaimRecord[];
  insurancePaymentTypeDefNums?: number[];
  paymentTypeClassification?: {
    insurance: number[];
    soonercare: number[];
    financed: number[];
    cash: number[];
  };
}): ProductionSummary {
  const notices = [...(params.notices ?? [])];
  const { fromYmd, toYmd } = params;
  const cdt = params.cdt ?? emptyCdtLookup;
  const soonerCarePatients = params.patients
    ? buildSoonerCarePatientSet(params.patients)
    : new Set<number>();

  const byProvider = new Map<number, ProviderProduction>();
  const providerMixMaps = new Map<number, Map<string, ProcedureMixRow>>();
  const totals = emptyTotals();

  const proceduresAvailable = params.proceduresAvailable ?? true;
  const chargesAvailable = params.chargesAvailable ?? true;
  const paymentsAvailable = params.paymentsAvailable ?? true;
  const adjustmentsAvailable = params.adjustmentsAvailable ?? true;
  const anyOk =
    proceduresAvailable ||
    chargesAvailable ||
    paymentsAvailable ||
    adjustmentsAvailable;

  const proceduresAll = params.procedures.filter(isActiveProcedure);
  const proceduresInRange = filterProceduresInRange(
    proceduresAll,
    fromYmd,
    toYmd,
  );
  const charges = params.charges.filter(
    (c) => !c.deleted_at && inYmdRange(c.charged_at, fromYmd, toYmd),
  );
  const payments = params.payments.filter(
    (p) => !p.deleted_at && inYmdRange(p.paid_at, fromYmd, toYmd),
  );
  const adjustments = params.adjustments.filter(
    (a) => !a.deleted_at && inYmdRange(a.adjusted_at, fromYmd, toYmd),
  );

  if (proceduresAvailable) {
    totals.procedureCount = proceduresInRange.length;
  } else {
    notices.push("Procedures unavailable.");
  }

  if (chargesAvailable) {
    totals.chargeCount = charges.length;
    for (const c of charges) {
      const cents = moneyToCents(c.fee);
      totals.grossProductionCents += cents;
      if (c.provider_id != null) {
        const prov = ensureProvider(byProvider, c.provider_id);
        prov.grossProductionCents += cents;
        prov.chargeCount += 1;
      }
    }
  } else {
    notices.push("Charges unavailable.");
  }

  if (paymentsAvailable) {
    totals.paymentCount = payments.length;
    let reversalCents = 0;
    for (const p of payments) {
      const raw = moneyToCents(p.payment_amount);
      const cents = paymentCollectionCents(p);
      if (raw < 0) reversalCents += raw;
      if (cents <= 0) continue;
      totals.collectionsCents += cents;
      if (p.provider_id != null) {
        const prov = ensureProvider(byProvider, p.provider_id);
        prov.collectionsCents += cents;
        prov.paymentCount += 1;
      }
    }
    if (reversalCents < 0) {
      notices.push(
        `Collection total excludes ${formatUsdNotice(Math.abs(reversalCents))} in payment reversals/credits (same rule as payment-mix charts).`,
      );
    }
  } else {
    notices.push("Payments unavailable.");
  }

  if (adjustmentsAvailable) {
    totals.adjustmentCount = adjustments.length;
    const typesById = buildAdjustmentTypeMap(params.adjustmentTypes ?? []);
    const typesAvailable = typesById.size > 0;

    for (const a of adjustments) {
      if (!typesAvailable || !isWriteOffAdjustment(a, typesById)) continue;
      const cents = Math.abs(moneyToCents(a.adjustment_amount));
      totals.adjustmentsCents += cents;
      if (a.provider_id != null) {
        const prov = ensureProvider(byProvider, a.provider_id);
        prov.adjustmentsCents += cents;
        prov.adjustmentCount += 1;
      }
    }

    if (!typesAvailable && adjustments.length > 0) {
      notices.push(
        "Adjusted production needs synced adjustment_types — run warehouse sync to flag write-off types.",
      );
    } else if (
      typesAvailable &&
      totals.adjustmentsCents === 0 &&
      adjustments.length > 0
    ) {
      notices.push(
        "No write-off adjustments matched synced adjustment_types flagged for adjusted production.",
      );
    }
  } else {
    notices.push("Adjustments unavailable.");
  }

  if (charges.length === 0 && proceduresInRange.length > 0) {
    let feeSum = 0;
    for (const p of proceduresInRange) {
      const cents = moneyToCents(p.fee);
      feeSum += cents;
      if (p.provider_id != null) {
        const prov = ensureProvider(byProvider, p.provider_id);
        prov.grossProductionCents += cents;
        prov.procedureCount += 1;
      }
    }
    if (feeSum > 0) {
      totals.grossProductionCents = feeSum;
      notices.push(
        "Gross production estimated from procedure fees (no charges in window).",
      );
    }
  } else {
    for (const p of proceduresInRange) {
      if (p.provider_id != null) {
        ensureProvider(byProvider, p.provider_id).procedureCount += 1;
      }
    }
  }

  const practiceMix = new Map<string, ProcedureMixRow>();
  const categoryMap = new Map<string, CategoryProductionRow>();
  const unmappedMap = new Map<string, ProcedureMixRow>();
  const procedureVolume = emptyProcedureVolume();
  const treatmentEntries: { monthKey: string; category: string; cents: number }[] =
    [];
  const dentureWarranty = emptyDentureWarrantyMix();
  const partialWarranty = emptyDentureWarrantyMix();

  const bumpWarranty = (code: string, chargeName: string, cents: number) => {
    bumpWarrantyProduction(
      cdt,
      code,
      chargeName,
      cents,
      dentureWarranty,
      partialWarranty,
    );
  };

  if (charges.length > 0) {
    for (const c of charges) {
      const code = (c.procedure_code || "UNKNOWN").trim() || "UNKNOWN";
      const chargeName = String(c.description ?? code).trim() || code;
      const cents = moneyToCents(c.fee);
      bumpMix(practiceMix, code, chargeName, cents);
      bumpCategory(cdt, categoryMap, code, chargeName, cents, unmappedMap);
      bumpWarranty(code, chargeName, cents);
      bumpScProduction(
        cdt,
        soonerCarePatients,
        code,
        chargeName,
        c.patient_id,
        cents,
        totals,
        byProvider,
        c.provider_id,
      );
      const cat = cdt.lookupCategory(code);
      const monthKey = monthKeyFromDate(c.charged_at);
      if (monthKey && cat) {
        treatmentEntries.push({ monthKey, category: cat, cents });
      }
      if (c.provider_id != null) {
        let pMix = providerMixMaps.get(c.provider_id);
        if (!pMix) {
          pMix = new Map();
          providerMixMaps.set(c.provider_id, pMix);
        }
        bumpMix(pMix, code, chargeName, cents);
        const prov = ensureProvider(byProvider, c.provider_id);
        bumpProviderCategory(cdt, prov, code, chargeName, cents);
      }
    }
  } else {
    for (const p of proceduresInRange) {
      const code = (p.code || "UNKNOWN").trim() || "UNKNOWN";
      const name = (p.name || code).trim();
      const cents = moneyToCents(p.fee);
      bumpMix(practiceMix, code, name, cents);
      bumpCategory(cdt, categoryMap, code, name, cents, unmappedMap);
      bumpWarranty(code, name, cents);
      bumpScProduction(
        cdt,
        soonerCarePatients,
        code,
        name,
        p.patient_id,
        cents,
        totals,
        byProvider,
        p.provider_id,
      );
      const date = p.start_date || p.end_date;
      const cat = cdt.lookupCategory(code);
      const monthKey = monthKeyFromDate(date);
      if (monthKey && cat) {
        treatmentEntries.push({ monthKey, category: cat, cents });
      }
      if (p.provider_id != null) {
        let pMix = providerMixMaps.get(p.provider_id);
        if (!pMix) {
          pMix = new Map();
          providerMixMaps.set(p.provider_id, pMix);
        }
        bumpMix(pMix, code, name, cents);
        const prov = ensureProvider(byProvider, p.provider_id);
        bumpProviderCategory(cdt, prov, code, name, cents);
      }
    }
  }

  accumulateProcedureVolume({
    cdt,
    procedures: params.procedures,
    fromYmd,
    toYmd,
    volume: procedureVolume,
    onProviderVolume: (providerId, bucket) => {
      ensureProvider(byProvider, providerId).procedureVolume[bucket] += 1;
    },
  });

  if (
    procedureVolume.extractions +
      procedureVolume.implants +
      procedureVolume.aox +
      procedureVolume.dentures +
      procedureVolume.partials +
      procedureVolume.remakes ===
      0 &&
    proceduresAvailable
  ) {
    notices.push(
      "Procedure volume empty — map volumeBucket on Code Chart codes and ensure procedures sync as completed.",
    );
  }

  const payTypes = params.paymentTypeClassification;
  const paymentClassifyOptions: PaymentClassificationOptions | undefined =
    payTypes || params.insurancePaymentTypeDefNums?.length
      ? {
          insurancePaymentTypeDefNums: new Set(
            payTypes?.insurance ?? params.insurancePaymentTypeDefNums ?? [],
          ),
          soonercarePaymentTypeDefNums: new Set(payTypes?.soonercare ?? []),
          financedPaymentTypeDefNums: new Set(payTypes?.financed ?? []),
          cashPaymentTypeDefNums: new Set(payTypes?.cash ?? []),
        }
      : undefined;

  let paymentMix = paymentsAvailable
    ? aggregatePaymentMix(payments, paymentClassifyOptions)
    : emptyPaymentMix();
  if (paymentsAvailable && params.claims && params.claims.length > 0) {
    const supplemented = supplementInsurancePaymentMixFromClaims(
      paymentMix,
      params.claims,
      fromYmd,
      toYmd,
    );
    paymentMix = supplemented.mix;
    if (supplemented.supplementedCents > 0) {
      notices.push(
        "Payment mix insurance includes claim receipts (InsPayAmt) not classified on paysplits.",
      );
    }
  }
  const financingVendorMix = paymentsAvailable
    ? aggregateFinancingVendorMix(payments, paymentClassifyOptions)
    : emptyFinancingVendorMix();
  if (paymentMix.unknownCents > 0 && paymentMix.totalCents > 0) {
    notices.push(
      `${formatUsdNotice(paymentMix.unknownCents)} of payments could not be classified — map payment types in the practice system.`,
    );
  }

  const trendRange = productionTrendRange();
  const trendChargeDates = collectTrendChargeDates(
    params.procedures,
    params.charges,
    trendRange.fromYmd,
    trendRange.toYmd,
    chargesAvailable,
    proceduresAvailable,
  );
  const periodChargeDates = collectTrendChargeDates(
    params.procedures,
    params.charges,
    fromYmd,
    toYmd,
    chargesAvailable,
    proceduresAvailable,
  );
  const monthlyProduction = buildMonthlyProductionSeries(trendChargeDates);
  const periodTrend = buildPeriodTrendPoints(periodChargeDates, fromYmd, toYmd);
  const treatmentByMonth = buildTreatmentByMonth(
    treatmentEntries,
    fromYmd,
    toYmd,
  );
  const monthlyCollections = paymentsAvailable
    ? buildMonthlyCollections(payments, periodChargeDates, fromYmd, toYmd)
    : [];

  const dentureWarrantyTotal =
    dentureWarranty.m6Cents +
    dentureWarranty.y1Cents +
    dentureWarranty.y3Cents +
    dentureWarranty.y5Cents;
  const partialWarrantyTotal =
    partialWarranty.m6Cents +
    partialWarranty.y1Cents +
    partialWarranty.y3Cents +
    partialWarranty.y5Cents;
  if (procedureVolume.dentures > 0 && dentureWarrantyTotal === 0) {
    notices.push(
      "Denture warranty buckets empty — chart warranty suffix codes on denture codes (not SC partials).",
    );
  }
  if (procedureVolume.partials > 0 && partialWarrantyTotal === 0) {
    notices.push(
      "Partial warranty buckets empty — chart warrantyBucket on partial denture codes.",
    );
  }

  const productionByCategory = sortCategoryRows([...categoryMap.values()]);
  const unmappedCodes = sortMixTop(unmappedMap, UNMAPPED_CODES_TOP_N);
  const uncategorizedProductionCents = [...unmappedMap.values()].reduce(
    (sum, row) => sum + row.productionCents,
    0,
  );
  const collectionRatio =
    totals.grossProductionCents > 0
      ? totals.collectionsCents / totals.grossProductionCents
      : null;

  if (unmappedCodes.length > 0 && productionByCategory.length > 0) {
    notices.push(
      `${formatUsdNotice(uncategorizedProductionCents)} production uses codes not in the CDT cockpit chart — see unmapped codes on Overview.`,
    );
  } else if (unmappedCodes.length > 0 && productionByCategory.length === 0) {
    notices.push(
      "Production is syncing but no codes match the CDT cockpit chart. Complete procedures with standard D-codes (e.g. D7140, D6010, D5110).",
    );
  }

  finalize(totals);
  for (const [pid, prov] of byProvider) {
    prov.procedureMix = sortMix(providerMixMaps.get(pid) ?? new Map());
    prov.productionByCategory = sortCategoryRows(prov.productionByCategory);
    prov.monthlyProduction = buildMonthlyProductionSeries(
      collectTrendChargeDates(
        params.procedures,
        params.charges,
        trendRange.fromYmd,
        trendRange.toYmd,
        chargesAvailable,
        proceduresAvailable,
        pid,
      ),
    );
    prov.periodTrend = buildPeriodTrendPoints(
      collectTrendChargeDates(
        params.procedures,
        params.charges,
        fromYmd,
        toYmd,
        chargesAvailable,
        proceduresAvailable,
        pid,
      ),
      fromYmd,
      toYmd,
    );
    finalize(prov);
  }

  if (!anyOk) {
    notices.unshift(
      "Production endpoints unavailable on this sync — appointment KPIs still load.",
    );
  } else if (
    totals.chargeCount === 0 &&
    totals.paymentCount === 0 &&
    totals.adjustmentCount === 0 &&
    totals.procedureCount === 0
  ) {
    notices.push(
      "No procedures/charges/payments/adjustments in this window (sandbox may lack ledger data).",
    );
  }

  return {
    available: anyOk,
    ...totals,
    procedureMix: sortMix(practiceMix),
    productionByCategory,
    procedureVolume,
    collectionRatio,
    uncategorizedProductionCents,
    unmappedCodes,
    paymentMix,
    financingVendorMix,
    monthlyProduction,
    periodTrend,
    treatmentByMonth,
    dentureWarranty,
    partialWarranty,
    monthlyCollections,
    byProvider,
    notices,
  };
}

function formatUsdNotice(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function emptyProviderProduction(): ProviderProduction {
  return {
    ...emptyTotals(),
    procedureMix: [],
    procedureVolume: emptyProcedureVolume(),
    productionByCategory: [],
    monthlyProduction: [],
    periodTrend: [],
  };
}
