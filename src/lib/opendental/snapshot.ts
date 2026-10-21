/**
 * Live Open Dental MySQL snapshot for dashboard pages.
 * Maps native rows into aggregator shapes; patients are slimmed (no names).
 */

import "server-only";
import { cache } from "react";
import type { CdtCodeRow } from "@/lib/cdt/categories";
import {
  createCdtLookupFromDocs,
  emptyCdtLookup,
} from "@/lib/cdt/categories";
import { catalogEntryToRow } from "@/lib/warehouse/procedure-code-catalog";
import {
  includeAdjustmentTypeInAdjustedProduction,
  type AdjustmentTypeRecord as WriteOffType,
} from "@/lib/warehouse/adjusted-production";
import {
  inferNpConsultAppointmentTypeIds,
  type NpConsultTypeDoc,
} from "@/lib/warehouse/kpi-reference";
import { inferNpConsultAppointmentTypeFromName } from "@/lib/opendental/infer-np-consult-appointment-type";
import { buildPaymentTypeDefMaps } from "@/lib/opendental/payment-type-classifier";
import { productionTrendRange } from "@/lib/warehouse/production";
import { todayCentralYmd } from "@/lib/ghl/practice-time";
import {
  annotateBrokenReasons,
  BROKEN_REASON_DAYS_BEFORE,
} from "@/lib/warehouse/broken-appointment-reason";
import type {
  AdjustmentRecord,
  AppointmentRecord,
  AppointmentTypeRecord,
  ChargeRecord,
  ClaimRecord,
  GuarantorBalanceRecord,
  InsuranceBalanceRecord,
  InsurancePlanRecord,
  PaymentRecord,
  ProcedureRecord,
  ProviderRecord,
  TreatmentPlanRecord,
} from "@/lib/warehouse/types";
import {
  isOpenDentalMysqlConfigured,
  requireOpenDentalMysqlConfig,
} from "@/lib/opendental/config";
import {
  getOdClinicNums,
  getWarehouseLocationId,
  getWarehouseLocationName,
  getWarehouseSubdomain,
} from "@/lib/opendental/location";
import {
  buildPrimaryCarrierMap,
  mapOdAdjTypeDefinition,
  mapOdClaimProc,
  odDateToYmd,
  type ClaimProcLine,
  mapOdAdjustment,
  mapOdAppointment,
  mapOdAppointmentType,
  mapOdClaim,
  mapOdGuarantorBalance,
  mapOdInsPlan,
  mapOdInsuranceBalance,
  mapOdPatient,
  mapOdPaySplit,
  mapOdProcCatDefinition,
  mapOdProcedure,
  mapOdProcedureToCharge,
  mapOdProvider,
  mapOdTreatPlan,
} from "@/lib/opendental/mappers";
import {
  listOdAdjTypeDefinitions,
  listOdAdjustments,
  listOdAppointmentTypes,
  listOdAppointments,
  listOdClaimProcs,
  listOdClaims,
  listOdGuarantorBalances,
  listOdInsPlans,
  listOdDailyProcedureProductionCents,
  listOdPatientsForDashboard,
  listOdPaySplits,
  listOdPaymentTypeDefinitions,
  listOdPlannedCoordinatorMarkers,
  listOdPrimaryPatPlans,
  listOdProcCatDefinitions,
  listOdProcTps,
  listOdProcedureCodes,
  listOdProcedureLogs,
  listOdProviders,
  listOdReferralAttaches,
  listOdTreatPlans,
  type OdDateWindow,
  type OdDailyLedgerTotal,
} from "@/lib/opendental/queries";
import type { ReferralAttach } from "@/lib/warehouse/marketing-sources";
import type { PlannedCoordinatorMarker } from "@/lib/tc/presented-plans";
import {
  indexPatientsForPhiStrip,
  stripPhiFromPatientRecord,
  type SlimPatientIndex,
} from "@/lib/mongo/phi-policy";

const APPOINTMENT_LOOKBACK_DAYS = 365;
const APPOINTMENT_LOOKAHEAD_DAYS = 365;
const TREATPLAN_LOOKBACK_DAYS = 730;

export type OpenDentalSnapshot = {
  loadedAt: string;
  locationId: number;
  subdomain: string;
  locationName: string | null;
  providers: ProviderRecord[];
  appointmentTypes: AppointmentTypeRecord[];
  appointmentTypeDocs: NpConsultTypeDoc[];
  appointments: AppointmentRecord[];
  procedures: ProcedureRecord[];
  charges: ChargeRecord[];
  payments: PaymentRecord[];
  adjustments: AdjustmentRecord[];
  adjustmentTypes: WriteOffType[];
  treatmentPlans: TreatmentPlanRecord[];
  guarantorBalances: GuarantorBalanceRecord[];
  claims: ClaimRecord[];
  claimProcs: ClaimProcLine[];
  insuranceBalances: InsuranceBalanceRecord[];
  insurancePlans: InsurancePlanRecord[];
  patients: SlimPatientIndex[];
  cdtRows: CdtCodeRow[];
  insurancePaymentTypeDefNums: number[];
  paymentTypeClassification: {
    insurance: number[];
    soonercare: number[];
    financed: number[];
    cash: number[];
  };
  procedureCategories: Array<{
    procCatId: number;
    name: string;
    hidden: boolean;
  }>;
  referrals: ReferralAttach[];
  /** Treatment-planned N9210 / N9410 codes; TC attribution fallback only. */
  plannedCoordinatorMarkers: PlannedCoordinatorMarker[];
  /** First appointment day included in this snapshot. */
  appointmentsLoadedFromYmd: string;
  /**
   * SQL GROUP BY day production (cents) over the 3-year trend window.
   * Row-level procedures cover the shorter detail window only.
   */
  dailyProductionByYmd: OdDailyLedgerTotal[];
};

function ymdDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function ymdDaysAhead(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Jan 1 of last year, or 365 days back if that is earlier, so the "Last year" preset is complete. */
export function detailWindowStartYmd(todayYmd: string, rollingStartYmd: string): string {
  const lastYearStart = `${Number(todayYmd.slice(0, 4)) - 1}-01-01`;
  return lastYearStart < rollingStartYmd ? lastYearStart : rollingStartYmd;
}

function appointmentWindow(): OdDateWindow {
  return {
    startYmd: detailWindowStartYmd(
      todayCentralYmd(),
      ymdDaysAgo(APPOINTMENT_LOOKBACK_DAYS),
    ),
    endYmd: ymdDaysAhead(APPOINTMENT_LOOKAHEAD_DAYS),
  };
}

/** Full trend span for SQL day aggregates only (not row-level ledger). */
function trendWindow(): OdDateWindow {
  const trend = productionTrendRange();
  return {
    startYmd: trend.fromYmd,
    endYmd: trend.toYmd,
  };
}

/**
 * Row-level procedures/paysplits/claims — the appointment window, starting early
 * enough to see D9986/D9987 posted before the first loaded visit,
 * so MariaDB is not asked for three years of ledger rows every page load.
 */
function detailLedgerWindow(appt: OdDateWindow): OdDateWindow {
  const start = new Date(`${appt.startYmd}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - BROKEN_REASON_DAYS_BEFORE);
  return {
    startYmd: start.toISOString().slice(0, 10),
    endYmd: appt.endYmd < trendWindow().endYmd ? appt.endYmd : trendWindow().endYmd,
  };
}

async function fetchOpenDentalSnapshot(): Promise<OpenDentalSnapshot> {
  if (!isOpenDentalMysqlConfigured()) {
    throw new Error(
      "Open Dental MySQL is not configured. Set OD_MYSQL_HOST, OD_MYSQL_USER, OD_MYSQL_DB, and OD_MYSQL_PASS in .env.local.",
    );
  }
  requireOpenDentalMysqlConfig();

  const clinicNums = getOdClinicNums();
  const apptWindow = appointmentWindow();
  const ledger = detailLedgerWindow(apptWindow);
  const trend = trendWindow();
  const treatPlanSince = isoDaysAgo(TREATPLAN_LOOKBACK_DAYS);

  const [
    providerRows,
    appointmentTypeRows,
    appointmentRows,
    procedureRows,
    paySplitRows,
    adjustmentRows,
    adjTypeRows,
    treatPlanRows,
    guarantorRows,
    claimRows,
    claimProcRows,
    insPlanRows,
    patientRows,
    primaryPlans,
    procedureCodeRows,
    procCatRows,
    paymentTypeDefs,
    referralRows,
    dailyProductionByYmd,
    plannedMarkerRows,
  ] = await Promise.all([
    listOdProviders(),
    listOdAppointmentTypes(),
    listOdAppointments(apptWindow, clinicNums),
    listOdProcedureLogs(ledger, clinicNums),
    listOdPaySplits(ledger, clinicNums),
    listOdAdjustments(ledger, clinicNums),
    listOdAdjTypeDefinitions(),
    listOdTreatPlans(treatPlanSince, ledger),
    listOdGuarantorBalances(),
    listOdClaims(ledger, clinicNums),
    listOdClaimProcs(ledger, clinicNums),
    listOdInsPlans(),
    listOdPatientsForDashboard({ appointment: apptWindow, ledger }),
    listOdPrimaryPatPlans(),
    listOdProcedureCodes(),
    listOdProcCatDefinitions(),
    listOdPaymentTypeDefinitions(),
    listOdReferralAttaches(),
    listOdDailyProcedureProductionCents(trend, clinicNums),
    listOdPlannedCoordinatorMarkers(ledger, clinicNums),
  ]);

  const paymentTypeMaps = buildPaymentTypeDefMaps(paymentTypeDefs);
  const paymentTypeClassification = {
    insurance: [...paymentTypeMaps.insurance],
    soonercare: [...paymentTypeMaps.soonercare],
    financed: [...paymentTypeMaps.financed],
    cash: [...paymentTypeMaps.cash],
  };
  const insurancePayTypeIds = paymentTypeClassification.insurance;

  const procTps = await listOdProcTps(treatPlanRows.map((row) => row.TreatPlanNum));
  const procsByPlan = new Map<number, typeof procTps>();
  for (const proc of procTps) {
    const list = procsByPlan.get(proc.TreatPlanNum) ?? [];
    list.push(proc);
    procsByPlan.set(proc.TreatPlanNum, list);
  }

  const procedureCategories = procCatRows.map((row) => {
    const mapped = mapOdProcCatDefinition(row);
    return {
      procCatId: mapped.procCatId,
      name: mapped.name,
      hidden: mapped.hidden,
    };
  });
  const categoryNameById = new Map(
    procedureCategories.map((row) => [row.procCatId, row.name]),
  );

  const cdtRows: CdtCodeRow[] = procedureCodeRows.map((row) => {
    const code = row.ProcCode?.trim() || "";
    const description = row.Descript?.trim() || code;
    return catalogEntryToRow(code, description, null, {
      procCatId: row.ProcCat,
      categoryFromProcCat: categoryNameById.get(row.ProcCat) ?? null,
    });
  });

  const cdt =
    cdtRows.length > 0 ? createCdtLookupFromDocs(cdtRows) : emptyCdtLookup;

  const procedures = procedureRows.map(mapOdProcedure);
  const appointments = annotateBrokenReasons(
    appointmentRows.map(mapOdAppointment),
    procedures,
  );
  const charges: ChargeRecord[] = [];
  for (const row of procedureRows) {
    const charge = mapOdProcedureToCharge(row);
    if (charge) charges.push(charge);
  }

  const appointmentTypes = appointmentTypeRows.map(mapOdAppointmentType);
  const namedConsultTypes = appointmentTypes.some((type) =>
    inferNpConsultAppointmentTypeFromName(type.name),
  );
  const inferredConsultTypes = namedConsultTypes
    ? new Set<number>()
    : new Set(
        inferNpConsultAppointmentTypeIds(appointments, procedures, cdt),
      );
  const appointmentTypeDocs: NpConsultTypeDoc[] = appointmentTypes.map(
    (type) => ({
      sourceId: type.id,
      isNpConsult: namedConsultTypes
        ? inferNpConsultAppointmentTypeFromName(type.name)
        : inferredConsultTypes.has(type.id),
    }),
  );

  const carrierByPatient = buildPrimaryCarrierMap(primaryPlans);
  const patientRecords = patientRows.map((row) =>
    mapOdPatient(row, carrierByPatient.get(row.PatNum) ?? null),
  );
  const bySourceId = indexPatientsForPhiStrip(patientRecords);
  const patients: SlimPatientIndex[] = [];
  for (let i = 0; i < patientRecords.length; i += 1) {
    const slim = stripPhiFromPatientRecord(patientRecords[i], bySourceId);
    if (!slim) continue;
    slim.dateFirstVisit = odDateToYmd(patientRows[i]?.DateFirstVisit);
    patients.push(slim);
  }

  return {
    loadedAt: new Date().toISOString(),
    locationId: getWarehouseLocationId(),
    subdomain: getWarehouseSubdomain(),
    locationName: getWarehouseLocationName(),
    providers: providerRows.map(mapOdProvider),
    appointmentTypes,
    appointmentTypeDocs,
    appointments,
    procedures,
    charges,
    payments: paySplitRows.map(mapOdPaySplit),
    adjustments: adjustmentRows.map(mapOdAdjustment),
    adjustmentTypes: adjTypeRows
      .map(mapOdAdjTypeDefinition)
      .filter((row) => row.active)
      .map((row) => ({
        id: row.id,
        name: row.name?.trim() || `Type ${row.id}`,
        includeInAdjustedProduction: includeAdjustmentTypeInAdjustedProduction(
          row.name?.trim() || `Type ${row.id}`,
          row.action,
        ),
      })),
    treatmentPlans: treatPlanRows.map((row) =>
      mapOdTreatPlan(row, procsByPlan.get(row.TreatPlanNum) ?? []),
    ),
    guarantorBalances: guarantorRows.map(mapOdGuarantorBalance),
    claims: claimRows.map(mapOdClaim),
    claimProcs: claimProcRows.map(mapOdClaimProc),
    insuranceBalances: guarantorRows.map(mapOdInsuranceBalance),
    insurancePlans: insPlanRows.map(mapOdInsPlan),
    patients,
    cdtRows,
    insurancePaymentTypeDefNums: insurancePayTypeIds,
    paymentTypeClassification,
    procedureCategories,
    referrals: referralRows.map((row) => ({
      patientId: row.PatNum,
      refDate: odDateToYmd(row.RefDate),
      itemOrder: Number(row.ItemOrder) || 0,
      attachId: row.RefAttachNum,
      lastName: row.LName?.trim() ?? "",
      firstName: row.FName?.trim() ?? "",
    })),
    plannedCoordinatorMarkers: plannedMarkerRows.map((row) => ({
      patientId: Number(row.PatNum),
      ymd: row.ProcDate,
      code: row.ProcCode,
    })),
    appointmentsLoadedFromYmd: apptWindow.startYmd,
    dailyProductionByYmd,
  };
}

/** Longer TTL: expensive OD reads should not re-hit MariaDB every navigation. */
export const SNAPSHOT_FRESH_MS = 10 * 60 * 1000;
export const SNAPSHOT_STALE_MS = 30 * 60 * 1000;

export function snapshotCacheAction(
  ageMs: number | null,
  freshMs = SNAPSHOT_FRESH_MS,
  staleMs = SNAPSHOT_STALE_MS,
): "fresh" | "stale" | "miss" {
  if (ageMs == null || ageMs < 0) return "miss";
  if (ageMs < freshMs) return "fresh";
  if (ageMs < staleMs) return "stale";
  return "miss";
}

type SnapshotCacheBox = {
  entry: { snapshot: OpenDentalSnapshot; loadedAtMs: number } | null;
  generation: number;
  inflight: Promise<OpenDentalSnapshot> | null;
};

const snapshotCacheBox: SnapshotCacheBox = ((
  globalThis as { __texomaOdSnapshot?: SnapshotCacheBox }
).__texomaOdSnapshot ??= {
  entry: null,
  generation: 0,
  inflight: null,
});

/** Cached snapshot when one is still fresh or stale. Does not start a database read. */
export function readCachedOpenDentalSnapshot(): OpenDentalSnapshot | null {
  const cached = snapshotCacheBox.entry;
  if (!cached) return null;
  const action = snapshotCacheAction(Date.now() - cached.loadedAtMs);
  if (action === "miss") return null;
  return cached.snapshot;
}

export function invalidateOpenDentalSnapshotCache(): void {
  snapshotCacheBox.generation += 1;
  snapshotCacheBox.entry = null;
  snapshotCacheBox.inflight = null;
}

function refreshOpenDentalSnapshot(): Promise<OpenDentalSnapshot> {
  if (snapshotCacheBox.inflight) return snapshotCacheBox.inflight;
  const generation = snapshotCacheBox.generation;
  snapshotCacheBox.inflight = fetchOpenDentalSnapshot()
    .then((snapshot) => {
      if (generation === snapshotCacheBox.generation) {
        snapshotCacheBox.entry = { snapshot, loadedAtMs: Date.now() };
      }
      return snapshot;
    })
    .finally(() => {
      if (generation === snapshotCacheBox.generation) snapshotCacheBox.inflight = null;
    });
  return snapshotCacheBox.inflight;
}

async function loadOpenDentalSnapshotCached(): Promise<OpenDentalSnapshot> {
  const cached = snapshotCacheBox.entry;
  const ageMs = cached ? Date.now() - cached.loadedAtMs : null;
  const action = snapshotCacheAction(ageMs);
  if (cached && action === "fresh") return cached.snapshot;
  if (cached && action === "stale") {
    void refreshOpenDentalSnapshot().catch((error: unknown) => {
      console.error(
        "Open Dental snapshot refresh failed",
        error instanceof Error ? error.message : error,
      );
    });
    return cached.snapshot;
  }
  return refreshOpenDentalSnapshot();
}

/** One snapshot per server request; also TTL-cached across requests. */
export const loadOpenDentalSnapshot = cache(loadOpenDentalSnapshotCached);

export async function loadOpenDentalSnapshotMeta(): Promise<{
  loadedAt: string;
  cacheAgeMs: number | null;
}> {
  const snapshot = await loadOpenDentalSnapshot();
  const cached = snapshotCacheBox.entry;
  return {
    loadedAt: snapshot.loadedAt,
    cacheAgeMs: cached ? Date.now() - cached.loadedAtMs : null,
  };
}
