/**
 * Build Overview KPIs from the Mongo warehouse (no NexHealth calls).
 */

import "server-only";
import { cache } from "react";
import {
  bumpTypeMix,
  emptyTypeMixRow,
  sortTypeMix,
  type AppointmentTypeMixRow,
} from "@/lib/nexhealth/appointment-mix";
import {
  buildConsultProcedureDays,
  emptyConversionSummary,
  inYmdRange,
  isConsultAppointment,
  mapConversionAttendance,
  resolveNpConsultTypeIds,
  summarizeConversion,
  perProviderSameDayNp,
} from "@/lib/nexhealth/conversion";
import { emptyTcMetrics, summarizeTcMetrics } from "@/lib/nexhealth/tc-metrics";
import { buildTcCoordinatorRows } from "@/lib/tc/coordinator-metrics";
import { safeRate } from "@/lib/metrics";
import {
  COLLECTIONS,
  isMongoConfigured,
  getCollection,
  type WarehouseMetaDoc,
} from "@/lib/mongo/client";
import type {
  AdjustmentDoc,
  AppointmentDoc,
  AppointmentTypeDoc,
  CdtCodeDoc,
  ChargeDoc,
  ClaimDoc,
  GuarantorBalanceDoc,
  InsuranceBalanceDoc,
  InsurancePlanDoc,
  PaymentDoc,
  PatientDoc,
  ProcedureCategoryDoc,
  ProcedureDoc,
  ProviderDoc,
  TreatmentPlanDoc,
} from "@/lib/mongo/types";
import {
  createCdtLookupFromDocs,
  emptyCdtLookup,
} from "@/lib/cdt/categories";
import {
  appointmentTypeId,
  getNexHealthConfig,
  mapAttendance,
  type NexAppointment,
  type NexAppointmentType,
} from "@/lib/nexhealth/client";
import { emptyArSummary, summarizeArFromBalances } from "@/lib/nexhealth/ar";
import {
  emptyInsuranceMetrics,
  summarizeInsuranceMetrics,
} from "@/lib/nexhealth/insurance-metrics";
import {
  emptyProviderProduction,
  summarizeProductionFromLedger,
} from "@/lib/nexhealth/production";
import type {
  LiveOverview,
  LiveProduction,
  LiveProviderRow,
  ProcedureCategory,
} from "@/lib/nexhealth/live";

const OVERVIEW_LOOKBACK_DAYS = 365;
const OVERVIEW_LOOKAHEAD_DAYS = 365;
const UNKNOWN_TYPE_ID = "unknown";

export type WarehouseOverview = LiveOverview & {
  source: "warehouse";
  lastSyncedAt: string | null;
  warehouseEmpty: boolean;
};

function defaultRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(
    now.getTime() - OVERVIEW_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const end = new Date(
    now.getTime() + OVERVIEW_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
  );
  const fmt = (d: Date) =>
    `${d.toISOString().slice(0, 19).replace("Z", "")}+0000`;
  return { start: fmt(start), end: fmt(end) };
}

function nexTsToYmd(nexTs: string): string {
  return nexTs.slice(0, 10);
}

function isUpcoming(appt: NexAppointment, now = Date.now()): boolean {
  if (!appt.start_time) return false;
  return new Date(appt.start_time).getTime() >= now;
}

function emptyAr() {
  return emptyArSummary();
}

function toProcedureCategories(docs: ProcedureCategoryDoc[]): ProcedureCategory[] {
  return docs.map((doc) => ({
    procCatId: doc.procCatId,
    name: doc.name,
    hidden: doc.hidden,
  }));
}

function emptyLiveProduction(
  procedureCategories: ProcedureCategory[] = [],
): LiveProduction {
  const production = summarizeProductionFromLedger({
    fromYmd: "1970-01-01",
    toYmd: "1970-01-01",
    procedures: [],
    charges: [],
    payments: [],
    adjustments: [],
    proceduresAvailable: false,
    chargesAvailable: false,
    paymentsAvailable: false,
    adjustmentsAvailable: false,
  });
  return {
    available: false,
    grossProductionCents: 0,
    scProductionCents: 0,
    collectionsCents: 0,
    adjustmentsCents: 0,
    netProductionCents: 0,
    procedureCount: 0,
    chargeCount: 0,
    paymentCount: 0,
    adjustmentCount: 0,
    procedureMix: [],
    productionByCategory: [],
    procedureCategories,
    procedureVolume: production.procedureVolume,
    collectionRatio: null,
    uncategorizedProductionCents: 0,
    unmappedCodes: [],
    paymentMix: production.paymentMix,
    financingVendorMix: production.financingVendorMix,
    monthlyProduction: [],
    treatmentByMonth: [],
    dentureWarranty: production.dentureWarranty,
    monthlyCollections: [],
  };
}

function emptyProviderRow(nexId: number, name: string): LiveProviderRow {
  return {
    id: String(nexId),
    nexId,
    name,
    appointmentCount: 0,
    showCount: 0,
    noShowCount: 0,
    cancelledCount: 0,
    unknownCount: 0,
    upcomingCount: 0,
    npConsultShow: 0,
    sameDayNp: 0,
    appointmentTypes: [],
    production: emptyProviderProduction(),
  };
}

function summarizeArFromWarehouse(rows: GuarantorBalanceDoc[]) {
  const notices: string[] = [];
  if (rows.length === 0) {
    notices.push(
      "No guarantor balances yet — AR tiles stay empty until balances sync.",
    );
  }
  return summarizeArFromBalances(
    rows.map((row) => row.raw),
    notices,
  );
}

export async function getWarehouseMeta(): Promise<WarehouseMetaDoc | null> {
  if (!isMongoConfigured()) return null;
  const col = await getCollection<WarehouseMetaDoc>(COLLECTIONS.meta);
  return col.findOne({ _id: "overview" });
}

export async function isWarehouseReady(): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  const meta = await getWarehouseMeta();
  return Boolean(meta?.lastSyncedAt);
}

async function buildWarehouseOverview(
  range: { start: string; end: string },
): Promise<WarehouseOverview> {
  const config = getNexHealthConfig();
  const meta = await getWarehouseMeta();
  const locationId =
    meta?.locationId ??
    config?.locationId ??
    Number(process.env.NEXHEALTH_LOCATION_ID || 0);
  const subdomain =
    meta?.subdomain ??
    config?.subdomain ??
    process.env.NEXHEALTH_SUBDOMAIN?.trim() ??
    "unknown";

  const notices: string[] = [];
  if (!meta?.lastSyncedAt) {
    notices.push(
      "No practice data yet — ask an administrator to run a sync. Overview will not call upstream APIs on each page load.",
    );
    return {
      source: "warehouse",
      lastSyncedAt: null,
      warehouseEmpty: true,
      locationId,
      subdomain,
      locationName: meta?.locationName ?? null,
      range,
      notices,
      providers: [],
      appointments: {
        total: 0,
        show: 0,
        noShow: 0,
        cancelled: 0,
        unknown: 0,
        upcoming: 0,
        past: 0,
      },
      showRate: 0,
      appointmentTypes: [],
      production: emptyLiveProduction(),
      conversion: emptyConversionSummary(),
      tcMetrics: emptyTcMetrics(),
      tcCoordinators: [],
      accountsReceivable: emptyAr(),
      insurance: emptyInsuranceMetrics(),
    };
  }

  const fromYmd = nexTsToYmd(range.start);
  const toYmd = nexTsToYmd(range.end);

  const [
    providers,
    appointmentTypes,
    appointments,
    procedures,
    charges,
    payments,
    adjustments,
    treatmentPlans,
    guarantorBalances,
    claimDocs,
    insuranceBalanceDocs,
    insurancePlanDocs,
    cdtDocs,
    procedureCategoryDocs,
    patientDocs,
  ] = await Promise.all([
    getCollection<ProviderDoc>(COLLECTIONS.providers).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<AppointmentTypeDoc>(COLLECTIONS.appointmentTypes).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<AppointmentDoc>(COLLECTIONS.appointments).then((c) =>
      c
        .find({
          locationId,
          startTime: { $lte: `${toYmd}T23:59:59` },
        })
        .toArray(),
    ),
    getCollection<ProcedureDoc>(COLLECTIONS.procedures).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<ChargeDoc>(COLLECTIONS.charges).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<PaymentDoc>(COLLECTIONS.payments).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<AdjustmentDoc>(COLLECTIONS.adjustments).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<TreatmentPlanDoc>(COLLECTIONS.treatmentPlans).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<GuarantorBalanceDoc>(COLLECTIONS.guarantorBalances).then(
      (c) => c.find({ locationId }).toArray(),
    ),
    getCollection<ClaimDoc>(COLLECTIONS.claims).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<InsuranceBalanceDoc>(COLLECTIONS.insuranceBalances).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<InsurancePlanDoc>(COLLECTIONS.insurancePlans).then((c) =>
      c.find({}).toArray(),
    ),
    getCollection<CdtCodeDoc>(COLLECTIONS.cdtCodes).then((c) => c.find({}).toArray()),
    getCollection<ProcedureCategoryDoc>(COLLECTIONS.procedureCategories).then((c) =>
      c.find({}).sort({ name: 1 }).toArray(),
    ),
    getCollection<PatientDoc>(COLLECTIONS.patients).then((c) =>
      c.find({ locationId }).toArray(),
    ),
  ]);

  const procedureCategories = toProcedureCategories(procedureCategoryDocs);

  const apptRawsAll = appointments.map((d) => d.raw);
  const apptRaws = apptRawsAll.filter((a) =>
    inYmdRange(a.start_time, fromYmd, toYmd),
  );
  const typeRaws = appointmentTypes.map((d) => d.raw);
  const procRaws = procedures.map((d) => d.raw);
  const typeCatalog = new Map<number, NexAppointmentType>();
  for (const t of typeRaws) typeCatalog.set(t.id, t);

  const cdt =
    cdtDocs.length > 0 ? createCdtLookupFromDocs(cdtDocs) : emptyCdtLookup;

  const production = summarizeProductionFromLedger({
    fromYmd,
    toYmd,
    procedures: procRaws,
    charges: charges.map((d) => d.raw),
    payments: payments.map((d) => d.raw),
    adjustments: adjustments.map((d) => d.raw),
    patients: patientDocs.map((d) => d.raw),
    cdt,
  });

  const conversion = summarizeConversion({
    fromYmd,
    toYmd,
    appointments: apptRawsAll,
    appointmentTypes: typeRaws,
    procedures: procRaws,
    plans: treatmentPlans.map((d) => d.raw),
    cdt,
  });

  const tcMetrics = summarizeTcMetrics({
    fromYmd,
    toYmd,
    appointments: apptRawsAll,
    appointmentTypes: typeRaws,
    plans: treatmentPlans.map((d) => d.raw),
    procedures: procRaws,
    payments: payments.map((d) => d.raw),
    conversion,
    cdt,
  });

  const tcCoordinators = buildTcCoordinatorRows({
    fromYmd,
    toYmd,
    appointments: apptRawsAll,
    appointmentTypes: typeRaws,
    plans: treatmentPlans.map((d) => d.raw),
    procedures: procRaws,
    payments: payments.map((d) => d.raw),
    providers: providers.map((d) => d.raw),
    cdt,
  });

  const accountsReceivable = summarizeArFromWarehouse(guarantorBalances);
  const insurance = summarizeInsuranceMetrics({
    fromYmd,
    toYmd,
    claims: claimDocs.map((d) => d.raw),
    balances: insuranceBalanceDocs.map((d) => d.raw),
    plans: insurancePlanDocs.map((d) => d.raw),
  });

  notices.push(...production.notices);
  notices.push(...conversion.notices);
  notices.push(...tcMetrics.notices);
  notices.push(...accountsReceivable.notices);
  notices.push(...insurance.notices);

  const { ids: npConsultTypeIds } = resolveNpConsultTypeIds(typeRaws);
  const npConsultTypeSet = new Set(npConsultTypeIds);
  const consultProcedureDays = buildConsultProcedureDays(procRaws, cdt);

  const now = Date.now();
  const byProvider = new Map<number, LiveProviderRow>();
  const providerTypeMaps = new Map<number, Map<string, AppointmentTypeMixRow>>();
  const practiceTypes = new Map<string, AppointmentTypeMixRow>();

  for (const p of providers.filter((x) => !x.inactive)) {
    byProvider.set(p.nexhealthId, emptyProviderRow(p.nexhealthId, p.name));
    providerTypeMaps.set(p.nexhealthId, new Map());
  }

  let show = 0;
  let noShow = 0;
  let cancelled = 0;
  let unknown = 0;
  let upcoming = 0;
  let past = 0;

  for (const appt of apptRaws) {
    const status = mapAttendance(appt);
    if (status === "show") show++;
    else if (status === "no_show") noShow++;
    else if (status === "cancelled") cancelled++;
    else unknown++;

    const upcomingAppt = isUpcoming(appt, now);
    if (upcomingAppt) upcoming++;
    else past++;

    const typeId = appointmentTypeId(appt);
    const typeMeta =
      typeId == null
        ? { id: UNKNOWN_TYPE_ID, name: "Unknown type" }
        : {
            id: String(typeId),
            name: typeCatalog.get(typeId)?.name?.trim() || `Type ${typeId}`,
          };

    let practiceRow = practiceTypes.get(typeMeta.id);
    if (!practiceRow) {
      practiceRow = emptyTypeMixRow(typeMeta.id, typeMeta.name);
      practiceTypes.set(typeMeta.id, practiceRow);
    }
    bumpTypeMix(practiceRow, status);

    const pid = appt.provider_id;
    if (pid == null) continue;
    let row = byProvider.get(pid);
    if (!row) {
      row = emptyProviderRow(
        pid,
        String(appt.provider_name || `Provider ${pid}`),
      );
      byProvider.set(pid, row);
      providerTypeMaps.set(pid, new Map());
    }
    row.appointmentCount++;
    if (upcomingAppt) row.upcomingCount++;
    if (status === "show") row.showCount++;
    else if (status === "no_show") row.noShowCount++;
    else if (status === "cancelled") row.cancelledCount++;
    else row.unknownCount++;

    if (
      isConsultAppointment(appt, npConsultTypeSet, consultProcedureDays) &&
      mapConversionAttendance(appt) === "show"
    ) {
      row.npConsultShow++;
    }

    const pTypes = providerTypeMaps.get(pid)!;
    let pRow = pTypes.get(typeMeta.id);
    if (!pRow) {
      pRow = emptyTypeMixRow(typeMeta.id, typeMeta.name);
      pTypes.set(typeMeta.id, pRow);
    }
    bumpTypeMix(pRow, status);
  }

  for (const [pid, row] of byProvider) {
    row.appointmentTypes = sortTypeMix([
      ...(providerTypeMaps.get(pid)?.values() ?? []),
    ]);
    const prod = production.byProvider.get(pid);
    if (prod) row.production = prod;
  }

  const sameDayByProvider = perProviderSameDayNp({
    fromYmd,
    toYmd,
    appointments: apptRawsAll,
    procedures: procRaws,
    appointmentTypes: typeRaws,
    cdt,
  });
  for (const [pid, count] of sameDayByProvider) {
    const row = byProvider.get(pid);
    if (row) row.sameDayNp = count;
  }

  const denom = show + noShow;
  const showRate = denom > 0 ? show / denom : 0;

  notices.unshift(
    `${subdomain}${meta.locationName ? ` · ${meta.locationName}` : ""} · updated ${meta.lastSyncedAt} · ${apptRaws.length} appointments`,
  );
  if (meta.lastSyncError) {
    notices.push(`Last sync had errors: ${meta.lastSyncError}`);
  }

  return {
    source: "warehouse",
    lastSyncedAt: meta.lastSyncedAt,
    warehouseEmpty: false,
    locationId,
    subdomain,
    locationName: meta.locationName,
    range,
    notices,
    providers: [...byProvider.values()].sort(
      (a, b) => b.appointmentCount - a.appointmentCount,
    ),
    appointments: {
      total: apptRaws.length,
      show,
      noShow,
      cancelled,
      unknown,
      upcoming,
      past,
    },
    showRate,
    appointmentTypes: sortTypeMix([...practiceTypes.values()]),
    production: {
      available: production.available,
      grossProductionCents: production.grossProductionCents,
      scProductionCents: production.scProductionCents,
      collectionsCents: production.collectionsCents,
      adjustmentsCents: production.adjustmentsCents,
      netProductionCents: production.netProductionCents,
      procedureCount: production.procedureCount,
      chargeCount: production.chargeCount,
      paymentCount: production.paymentCount,
      adjustmentCount: production.adjustmentCount,
      procedureMix: production.procedureMix,
      productionByCategory: production.productionByCategory,
      procedureCategories,
      procedureVolume: production.procedureVolume,
      collectionRatio: production.collectionRatio,
      uncategorizedProductionCents: production.uncategorizedProductionCents,
      unmappedCodes: production.unmappedCodes,
      paymentMix: production.paymentMix,
      financingVendorMix: production.financingVendorMix,
      monthlyProduction: production.monthlyProduction,
      treatmentByMonth: production.treatmentByMonth,
      dentureWarranty: production.dentureWarranty,
      monthlyCollections: production.monthlyCollections,
    },
    conversion,
    tcMetrics,
    tcCoordinators,
    accountsReceivable,
    insurance,
  };
}

/** Prefer Mongo warehouse. Never hits NexHealth on page load. */
export const loadWarehouseOverview = cache(
  async (start?: string, end?: string): Promise<WarehouseOverview> => {
    if (!isMongoConfigured()) {
      throw new Error(
        "Practice data warehouse is not configured. Set MONGODB_URI in .env.local and run npm run sync:nexhealth.",
      );
    }
    const range = start && end ? { start, end } : defaultRange();
    return buildWarehouseOverview(range);
  },
);
