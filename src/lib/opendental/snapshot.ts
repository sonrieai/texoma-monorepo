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
  defaultIncludeInAdjustedProduction,
  type AdjustmentTypeRecord as WriteOffType,
} from "@/lib/warehouse/adjusted-production";
import {
  inferNpConsultAppointmentTypeIds,
  type NpConsultTypeDoc,
} from "@/lib/warehouse/kpi-reference";
import { productionTrendRange } from "@/lib/warehouse/production";
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
  listOdClaims,
  listOdGuarantorBalances,
  listOdInsPlans,
  listOdPatients,
  listOdPaySplits,
  listOdPrimaryPatPlans,
  listOdProcCatDefinitions,
  listOdProcTps,
  listOdProcedureCodes,
  listOdProcedureLogs,
  listOdProviders,
  listOdTreatPlans,
  type OdDateWindow,
} from "@/lib/opendental/queries";
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
  insuranceBalances: InsuranceBalanceRecord[];
  insurancePlans: InsurancePlanRecord[];
  patients: SlimPatientIndex[];
  cdtRows: CdtCodeRow[];
  procedureCategories: Array<{
    procCatId: number;
    name: string;
    hidden: boolean;
  }>;
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

function appointmentWindow(): OdDateWindow {
  return {
    startYmd: ymdDaysAgo(APPOINTMENT_LOOKBACK_DAYS),
    endYmd: ymdDaysAhead(APPOINTMENT_LOOKAHEAD_DAYS),
  };
}

function ledgerWindow(): OdDateWindow {
  const trend = productionTrendRange();
  return {
    startYmd: trend.fromYmd,
    endYmd: ymdDaysAhead(APPOINTMENT_LOOKAHEAD_DAYS),
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
  const ledger = ledgerWindow();
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
    insPlanRows,
    patientRows,
    primaryPlans,
    procedureCodeRows,
    procCatRows,
  ] = await Promise.all([
    listOdProviders(),
    listOdAppointmentTypes(),
    listOdAppointments(apptWindow, clinicNums),
    listOdProcedureLogs(ledger, clinicNums),
    listOdPaySplits(ledger, clinicNums),
    listOdAdjustments(ledger, clinicNums),
    listOdAdjTypeDefinitions(),
    listOdTreatPlans(treatPlanSince),
    listOdGuarantorBalances(),
    listOdClaims(ledger, clinicNums),
    listOdInsPlans(),
    listOdPatients(),
    listOdPrimaryPatPlans(),
    listOdProcedureCodes(),
    listOdProcCatDefinitions(),
  ]);

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

  const appointments = appointmentRows.map(mapOdAppointment);
  const procedures = procedureRows.map(mapOdProcedure);
  const charges: ChargeRecord[] = [];
  for (const row of procedureRows) {
    const charge = mapOdProcedureToCharge(row);
    if (charge) charges.push(charge);
  }

  const inferredConsultTypes = new Set(
    inferNpConsultAppointmentTypeIds(appointments, procedures, cdt),
  );
  const appointmentTypes = appointmentTypeRows.map(mapOdAppointmentType);
  const appointmentTypeDocs: NpConsultTypeDoc[] = appointmentTypes.map(
    (type) => ({
      sourceId: type.id,
      isNpConsult: inferredConsultTypes.has(type.id),
    }),
  );

  const carrierByPatient = buildPrimaryCarrierMap(primaryPlans);
  const patientRecords = patientRows.map((row) =>
    mapOdPatient(row, carrierByPatient.get(row.PatNum) ?? null),
  );
  const bySourceId = indexPatientsForPhiStrip(patientRecords);
  const patients: SlimPatientIndex[] = [];
  for (const record of patientRecords) {
    const slim = stripPhiFromPatientRecord(record, bySourceId);
    if (slim) patients.push(slim);
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
        includeInAdjustedProduction:
          row.action === "subtract" ||
          defaultIncludeInAdjustedProduction(row.action),
      })),
    treatmentPlans: treatPlanRows.map((row) =>
      mapOdTreatPlan(row, procsByPlan.get(row.TreatPlanNum) ?? []),
    ),
    guarantorBalances: guarantorRows.map(mapOdGuarantorBalance),
    claims: claimRows.map(mapOdClaim),
    insuranceBalances: guarantorRows.map(mapOdInsuranceBalance),
    insurancePlans: insPlanRows.map(mapOdInsPlan),
    patients,
    cdtRows,
    procedureCategories,
  };
}

/** One snapshot per server request (Overview, Doctor, TC, Insurance, Geo). */
export const loadOpenDentalSnapshot = cache(fetchOpenDentalSnapshot);
