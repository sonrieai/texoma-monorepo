/**
 * Build Overview KPIs from a mapped Open Dental snapshot (no Mongo).
 */

import {
  bumpTypeMix,
  emptyTypeMixRow,
  sortTypeMix,
  type AppointmentTypeMixRow,
} from "@/lib/warehouse/appointment-mix";
import {
  buildConsultProcedureDays,
  emptyConversionSummary,
  inYmdRange,
  isConsultAppointment,
  mapConversionAttendance,
  summarizeConversion,
  perProviderDeferredNpClose,
  perProviderSameDayNp,
  perProviderScNpSeen,
} from "@/lib/warehouse/conversion";
import { resolveNpConsultTypeIds } from "@/lib/warehouse/kpi-reference";
import { emptyTcMetrics, summarizeTcMetrics } from "@/lib/warehouse/tc-metrics";
import { buildTcCoordinatorRows } from "@/lib/tc/coordinator-metrics";
import {
  createCdtLookupFromDocs,
  emptyCdtLookup,
} from "@/lib/cdt/categories";
import {
  appointmentTypeId,
  type AppointmentRecord,
  type AppointmentTypeRecord,
} from "@/lib/warehouse/types";
import { emptyArSummary, summarizeArFromBalances } from "@/lib/warehouse/ar";
import {
  emptyInsuranceMetrics,
  summarizeInsuranceMetrics,
} from "@/lib/warehouse/insurance-metrics";
import {
  emptyProviderProduction,
  summarizeProductionFromLedger,
} from "@/lib/warehouse/production";
import { isExcludedDoctorProvider } from "@/lib/warehouse/excluded-doctor-providers";
import { buildSoonerCarePatientSet } from "@/lib/warehouse/sc-production";
import type { OpenDentalSnapshot } from "@/lib/opendental/snapshot";
import type {
  LiveOverview,
  LiveProduction,
  LiveProviderRow,
  ProcedureCategory,
} from "@/lib/warehouse/live";

const OVERVIEW_LOOKBACK_DAYS = 365;
const OVERVIEW_LOOKAHEAD_DAYS = 365;
const UNKNOWN_TYPE_ID = "unknown";

export function defaultOverviewRange(): { start: string; end: string } {
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

function timestampToYmd(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function isUpcoming(appt: AppointmentRecord, now = Date.now()): boolean {
  if (!appt.start_time) return false;
  return new Date(appt.start_time).getTime() >= now;
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
    periodTrend: [],
    treatmentByMonth: [],
    dentureWarranty: production.dentureWarranty,
    partialWarranty: production.partialWarranty,
    monthlyCollections: [],
  };
}

function emptyProviderRow(sourceId: number, name: string): LiveProviderRow {
  return {
    id: String(sourceId),
    sourceId,
    name,
    appointmentCount: 0,
    showCount: 0,
    noShowCount: 0,
    cancelledCount: 0,
    unknownCount: 0,
    upcomingCount: 0,
    npConsultShow: 0,
    sameDayNp: 0,
    scNpSeen: 0,
    npClosedDeferred: 0,
    appointmentTypes: [],
    production: emptyProviderProduction(),
  };
}

function emptyOverview(
  snapshot: OpenDentalSnapshot,
  range: { start: string; end: string },
  notices: string[],
): LiveOverview {
  return {
    source: "opendental",
    lastSyncedAt: snapshot.loadedAt,
    warehouseEmpty: true,
    locationId: snapshot.locationId,
    subdomain: snapshot.subdomain,
    locationName: snapshot.locationName,
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
    accountsReceivable: emptyArSummary(),
    insurance: emptyInsuranceMetrics(),
  };
}

export function buildOverviewFromSnapshot(
  snapshot: OpenDentalSnapshot,
  range: { start: string; end: string },
): LiveOverview {
  const emptyPractice =
    snapshot.providers.length === 0 &&
    snapshot.appointments.length === 0 &&
    snapshot.procedures.length === 0;
  if (emptyPractice) {
    return emptyOverview(snapshot, range, [
      "Open Dental returned no appointments, procedures, or providers for this connection.",
    ]);
  }

  const fromYmd = timestampToYmd(range.start);
  const toYmd = timestampToYmd(range.end);
  const notices: string[] = [];

  const cdt =
    snapshot.cdtRows.length > 0
      ? createCdtLookupFromDocs(snapshot.cdtRows)
      : emptyCdtLookup;

  const apptRawsAll = snapshot.appointments;
  const apptRaws = apptRawsAll.filter((a) =>
    inYmdRange(a.start_time, fromYmd, toYmd),
  );
  const typeRaws = snapshot.appointmentTypes;
  const typeCatalog = new Map<number, AppointmentTypeRecord>();
  for (const t of typeRaws) typeCatalog.set(t.id, t);

  const production = summarizeProductionFromLedger({
    fromYmd,
    toYmd,
    procedures: snapshot.procedures,
    charges: snapshot.charges,
    payments: snapshot.payments,
    adjustments: snapshot.adjustments,
    adjustmentTypes: snapshot.adjustmentTypes,
    patients: snapshot.patients.map((d) => ({
      id: d.patientId,
      primaryInsuranceCarrier: d.primaryInsuranceCarrier,
    })),
    cdt,
    claims: snapshot.claims,
    claimProcs: snapshot.claimProcs,
    insurancePaymentTypeDefNums: snapshot.insurancePaymentTypeDefNums,
    paymentTypeClassification: snapshot.paymentTypeClassification,
  });

  const soonercarePatientIds = buildSoonerCarePatientSet(
    snapshot.patients.map((p) => ({
      id: p.patientId,
      primary_insurance_carrier: p.primaryInsuranceCarrier,
    })),
  );

  const conversion = summarizeConversion({
    fromYmd,
    toYmd,
    appointments: apptRawsAll,
    appointmentTypes: typeRaws,
    appointmentTypeDocs: snapshot.appointmentTypeDocs,
    procedures: snapshot.procedures,
    plans: snapshot.treatmentPlans,
    payments: snapshot.payments,
    cdt,
    firstVisits: snapshot.patients.map((patient) => patient.dateFirstVisit),
  });

  const tcMetrics = summarizeTcMetrics({
    fromYmd,
    toYmd,
    appointments: apptRawsAll,
    appointmentTypes: typeRaws,
    appointmentTypeDocs: snapshot.appointmentTypeDocs,
    plans: snapshot.treatmentPlans,
    procedures: snapshot.procedures,
    payments: snapshot.payments,
    conversion,
    cdt,
    soonercarePatientIds,
  });

  const tcCoordinators = buildTcCoordinatorRows({
    fromYmd,
    toYmd,
    appointments: apptRawsAll,
    appointmentTypes: typeRaws,
    plans: snapshot.treatmentPlans,
    procedures: snapshot.procedures,
    payments: snapshot.payments,
    providers: snapshot.providers,
    cdt,
  });

  const accountsReceivable = summarizeArFromBalances(
    snapshot.guarantorBalances,
    snapshot.guarantorBalances.length === 0
      ? ["No guarantor balances yet — AR tiles stay empty."]
      : [],
  );
  const insurance = summarizeInsuranceMetrics({
    fromYmd,
    toYmd,
    claims: snapshot.claims,
    claimProcs: snapshot.claimProcs,
    balances: snapshot.insuranceBalances,
    plans: snapshot.insurancePlans,
    soonercarePatientIds,
  });

  notices.push(...production.notices);
  notices.push(...conversion.notices);
  notices.push(...tcMetrics.notices);
  notices.push(...accountsReceivable.notices);
  notices.push(...insurance.notices);

  const { ids: npConsultTypeIds } = resolveNpConsultTypeIds({
    appointmentTypeDocs: snapshot.appointmentTypeDocs,
  });
  const npConsultTypeSet = new Set(npConsultTypeIds);
  const consultProcedureDays = buildConsultProcedureDays(
    snapshot.procedures,
    cdt,
  );

  const now = Date.now();
  const byProvider = new Map<number, LiveProviderRow>();
  const providerTypeMaps = new Map<number, Map<string, AppointmentTypeMixRow>>();
  const practiceTypes = new Map<string, AppointmentTypeMixRow>();
  const excludedProviderIds = new Set(
    snapshot.providers
      .filter((p) => isExcludedDoctorProvider(p.name ?? ""))
      .map((p) => p.id),
  );

  for (const p of snapshot.providers.filter((x) => !x.inactive)) {
    if (excludedProviderIds.has(p.id)) continue;
    byProvider.set(p.id, emptyProviderRow(p.id, p.name ?? `Provider ${p.id}`));
    providerTypeMaps.set(p.id, new Map());
  }

  let show = 0;
  let noShow = 0;
  let cancelled = 0;
  let unknown = 0;
  let upcoming = 0;
  let past = 0;

  for (const appt of apptRaws) {
    const status = mapConversionAttendance(appt);
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
    if (pid == null || excludedProviderIds.has(pid)) continue;
    let row = byProvider.get(pid);
    if (!row) {
      const name = String(appt.provider_name || `Provider ${pid}`);
      if (isExcludedDoctorProvider(name)) {
        excludedProviderIds.add(pid);
        continue;
      }
      row = emptyProviderRow(pid, name);
      byProvider.set(pid, row);
      providerTypeMaps.set(pid, new Map());
    }
    row.appointmentCount++;
    if (upcomingAppt) row.upcomingCount++;
    if (status === "show") row.showCount++;
    else if (status === "no_show") row.noShowCount++;
    else if (status === "cancelled") row.cancelledCount++;
    else row.unknownCount++;

    const flaggedNewPatient = typeof appt.is_new_patient === "boolean";
    if (
      flaggedNewPatient
        ? appt.is_new_patient === true &&
          mapConversionAttendance(appt) === "show"
        : isConsultAppointment(appt, npConsultTypeSet, consultProcedureDays) &&
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

  const providerNpParams = {
    fromYmd,
    toYmd,
    appointments: apptRawsAll,
    procedures: snapshot.procedures,
    appointmentTypes: typeRaws,
    appointmentTypeDocs: snapshot.appointmentTypeDocs,
    cdt,
    soonercarePatientIds,
    payments: snapshot.payments,
  };
  for (const [pid, count] of perProviderSameDayNp(providerNpParams)) {
    const row = byProvider.get(pid);
    if (row) row.sameDayNp = count;
  }
  for (const [pid, count] of perProviderScNpSeen(providerNpParams)) {
    const row = byProvider.get(pid);
    if (row) row.scNpSeen = count;
  }
  for (const [pid, count] of perProviderDeferredNpClose(providerNpParams)) {
    const row = byProvider.get(pid);
    if (row) row.npClosedDeferred = count;
  }

  const denom = show + noShow;
  const showRate = denom > 0 ? show / denom : 0;

  return {
    source: "opendental",
    lastSyncedAt: snapshot.loadedAt,
    warehouseEmpty: false,
    locationId: snapshot.locationId,
    subdomain: snapshot.subdomain,
    locationName: snapshot.locationName,
    range,
    notices,
    providers: [...byProvider.values()]
      .filter((p) => !isExcludedDoctorProvider(p.name))
      .sort((a, b) => b.appointmentCount - a.appointmentCount),
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
      procedureCategories: snapshot.procedureCategories,
      procedureVolume: production.procedureVolume,
      collectionRatio: production.collectionRatio,
      uncategorizedProductionCents: production.uncategorizedProductionCents,
      unmappedCodes: production.unmappedCodes,
      paymentMix: production.paymentMix,
      financingVendorMix: production.financingVendorMix,
      monthlyProduction: production.monthlyProduction,
      periodTrend: production.periodTrend,
      treatmentByMonth: production.treatmentByMonth,
      dentureWarranty: production.dentureWarranty,
      partialWarranty: production.partialWarranty,
      monthlyCollections: production.monthlyCollections,
    },
    conversion,
    tcMetrics,
    tcCoordinators,
    accountsReceivable,
    insurance,
  };
}
