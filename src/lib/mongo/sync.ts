/**
 * Sync NexHealth → MongoDB warehouse (scheduled / manual).
 * Dashboard pages must read Mongo only — never call this on every page load.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  COLLECTIONS,
  ensureWarehouseIndexes,
  getCollection,
  isMongoConfigured,
  type SyncResource,
  type SyncStateDoc,
  type WarehouseMetaDoc,
  type SyncTrigger,
} from "@/lib/mongo/client";
import { recordSyncHistory } from "@/lib/mongo/sync-history";
import { syncProcedureCodesFromNexHealth } from "@/lib/mongo/sync-procedure-codes";
import {
  procedureCategoryMap,
  syncProcedureCategoriesFromDescriptors,
} from "@/lib/mongo/sync-procedure-categories";
import { buildProcedureCodeFees } from "@/lib/nexhealth/procedure-code-fees";
import type {
  AdjustmentDoc,
  AdjustmentTypeDoc,
  AppointmentDoc,
  AppointmentTypeDoc,
  CdtCodeDoc,
  ChargeDoc,
  ClaimDoc,
  GuarantorBalanceDoc,
  InsuranceBalanceDoc,
  InsurancePlanDoc,
  PatientDoc,
  PaymentDoc,
  ProcedureDoc,
  ProviderDoc,
  TreatmentPlanDoc,
} from "@/lib/mongo/types";
import {
  appointmentTypeId,
  getNexHealthConfig,
  isNexHealthConfigured,
  listAdjustments,
  listAdjustmentTypes,
  listAppointments,
  listAppointmentTypes,
  listCharges,
  listFeeScheduleProcedures,
  listFeeSchedules,
  listGuarantorBalances,
  listClaims,
  listInsuranceBalances,
  listInsurancePlans,
  listLocations,
  listPatients,
  listPayments,
  listProcedureCodeDescriptors,
  listProcedures,
  listProviders,
  listTreatmentPlans,
  nexHealthConfigStatus,
  providerDisplayName,
  resolveListMaxPages,
  type NexAppointment,
  type NexAppointmentType,
  type NexAdjustment,
  type NexAdjustmentType,
  type NexCharge,
  type NexGuarantorBalance,
  type NexClaim,
  type NexInsuranceBalance,
  type NexInsurancePlan,
  type NexPatient,
  type NexPayment,
  type NexProcedure,
  type NexProvider,
  type NexTreatmentPlan,
} from "@/lib/nexhealth/client";
import {
  indexPatientsForPhiStrip,
  PATIENT_PHI_UNSET_FIELDS,
  slimNexAdjustment,
  slimNexAppointment,
  slimNexCharge,
  slimNexClaim,
  slimNexGuarantorBalance,
  slimNexInsuranceBalance,
  slimNexInsurancePlan,
  slimNexPayment,
  slimNexProcedure,
  slimNexTreatmentPlan,
  stripPhiFromNexPatient,
} from "@/lib/mongo/phi-policy";
import {
  createCdtLookupFromDocs,
  emptyCdtLookup,
  type CdtLookup,
} from "@/lib/cdt/categories";
import {
  inferNpConsultAppointmentTypeIds,
  npConsultTypeIdsFromDocs,
} from "@/lib/nexhealth/kpi-reference";
import { defaultIncludeInAdjustedProduction } from "@/lib/nexhealth/adjusted-production";

const LOOKBACK_DAYS = 365;
const LOOKAHEAD_DAYS = 365;
const DEFAULT_UPDATED_SINCE_DAYS = 400;

export type SyncRunOptions = {
  trigger?: SyncTrigger;
  triggeredBy?: string | null;
};

export type SyncResult = {
  ok: boolean;
  locationId: number;
  subdomain: string;
  locationName: string | null;
  lastSyncedAt: string;
  nexhealthRequestCount: number;
  upserts: Record<string, number>;
  errors: string[];
  /** NP consult appointment types inferred on last sync (chart + schedule). */
  npConsultAppointmentTypeIds?: number[];
};

/** Load `.env.local` into process.env when running via CLI (tsx). */
export function loadEnvLocal(repoRoot = process.cwd()): void {
  const path = join(repoRoot, ".env.local");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatNexTs(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace("Z", "")}+0000`;
}

function appointmentRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  return { start: formatNexTs(start), end: formatNexTs(end) };
}

function defaultUpdatedSince(): string {
  const d = new Date(Date.now() - DEFAULT_UPDATED_SINCE_DAYS * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/** Re-fetch incremental resources from default window (backfills schema changes). */
export function isFullWarehouseSync(): boolean {
  const raw = process.env.SYNC_NEXHEALTH_FULL?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

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

async function getSyncState(
  locationId: number,
  resource: SyncResource,
): Promise<SyncStateDoc | null> {
  const col = await getCollection<SyncStateDoc>(COLLECTIONS.syncState);
  return col.findOne({ locationId, resource });
}

async function saveSyncState(doc: SyncStateDoc): Promise<void> {
  const col = await getCollection<SyncStateDoc>(COLLECTIONS.syncState);
  await col.updateOne(
    { locationId: doc.locationId, resource: doc.resource },
    { $set: doc },
    { upsert: true },
  );
}

function nexId(raw: { id?: number } | null | undefined): number | null {
  return typeof raw?.id === "number" ? raw.id : null;
}

async function upsertProviders(
  locationId: number,
  subdomain: string,
  rows: NexProvider[],
): Promise<number> {
  const col = await getCollection<ProviderDoc>(COLLECTIONS.providers);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: ProviderDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : null,
      syncedAt,
      name: providerDisplayName(raw),
      inactive: Boolean(raw.inactive),
      raw,
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertAppointmentTypes(
  locationId: number,
  subdomain: string,
  rows: NexAppointmentType[],
): Promise<number> {
  const col = await getCollection<AppointmentTypeDoc>(
    COLLECTIONS.appointmentTypes,
  );
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const existing = await col.findOne({ locationId, nexhealthId: id });
    const doc: AppointmentTypeDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: null,
      syncedAt,
      name: raw.name?.trim() || `Type ${id}`,
      isNpConsult: existing?.isNpConsult,
      raw,
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertAppointments(
  locationId: number,
  subdomain: string,
  rows: NexAppointment[],
): Promise<number> {
  const col = await getCollection<AppointmentDoc>(COLLECTIONS.appointments);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: AppointmentDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : null,
      syncedAt,
      providerId: typeof raw.provider_id === "number" ? raw.provider_id : null,
      patientId: typeof raw.patient_id === "number" ? raw.patient_id : null,
      appointmentTypeId: appointmentTypeId(raw),
      startTime: raw.start_time ?? null,
      cancelled: Boolean(raw.cancelled),
      raw: slimNexAppointment(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertProcedures(
  locationId: number,
  subdomain: string,
  rows: NexProcedure[],
): Promise<number> {
  const col = await getCollection<ProcedureDoc>(COLLECTIONS.procedures);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: ProcedureDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      providerId: typeof raw.provider_id === "number" ? raw.provider_id : null,
      patientId: typeof raw.patient_id === "number" ? (raw.patient_id as number) : null,
      procedureCode: raw.code ?? null,
      startDate: raw.start_date ?? null,
      status: raw.status ?? null,
      raw: slimNexProcedure(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertCharges(
  locationId: number,
  subdomain: string,
  rows: NexCharge[],
): Promise<number> {
  const col = await getCollection<ChargeDoc>(COLLECTIONS.charges);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: ChargeDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      providerId: typeof raw.provider_id === "number" ? raw.provider_id : null,
      patientId: typeof raw.patient_id === "number" ? raw.patient_id : null,
      procedureCode: raw.procedure_code ?? null,
      chargedAt: raw.charged_at ?? null,
      deletedAt: raw.deleted_at ?? null,
      raw: slimNexCharge(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertPayments(
  locationId: number,
  subdomain: string,
  rows: NexPayment[],
): Promise<number> {
  const col = await getCollection<PaymentDoc>(COLLECTIONS.payments);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: PaymentDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      providerId: typeof raw.provider_id === "number" ? raw.provider_id : null,
      paidAt: raw.paid_at ?? null,
      deletedAt: raw.deleted_at ?? null,
      raw: slimNexPayment(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertAdjustments(
  locationId: number,
  subdomain: string,
  rows: NexAdjustment[],
): Promise<number> {
  const col = await getCollection<AdjustmentDoc>(COLLECTIONS.adjustments);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: AdjustmentDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      providerId: typeof raw.provider_id === "number" ? raw.provider_id : null,
      adjustedAt: raw.adjusted_at ?? null,
      deletedAt: raw.deleted_at ?? null,
      raw: slimNexAdjustment(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertAdjustmentTypes(
  locationId: number,
  subdomain: string,
  rows: NexAdjustmentType[],
): Promise<number> {
  const col = await getCollection<AdjustmentTypeDoc>(COLLECTIONS.adjustmentTypes);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const existing = await col.findOne({ locationId, nexhealthId: id });
    const action =
      typeof raw.action === "string" ? raw.action.trim().toLowerCase() : null;
    const doc: AdjustmentTypeDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      name: raw.name?.trim() || `Type ${id}`,
      active: raw.active !== false,
      action,
      includeInAdjustedProduction:
        existing?.includeInAdjustedProduction ??
        defaultIncludeInAdjustedProduction(action),
      raw,
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function refreshNpConsultAppointmentTypes(
  locationId: number,
  appointments: NexAppointment[],
  procedures: NexProcedure[],
  cdt: CdtLookup,
): Promise<number[]> {
  const inferred = new Set(
    inferNpConsultAppointmentTypeIds(appointments, procedures, cdt),
  );
  const col = await getCollection<AppointmentTypeDoc>(COLLECTIONS.appointmentTypes);
  const docs = await col.find({ locationId }).toArray();
  const syncedAt = nowIso();
  for (const doc of docs) {
    const isNpConsult = doc.isNpConsult === true || inferred.has(doc.nexhealthId);
    if (doc.isNpConsult === isNpConsult) continue;
    await col.updateOne(
      { locationId, nexhealthId: doc.nexhealthId },
      { $set: { isNpConsult, syncedAt } },
    );
    doc.isNpConsult = isNpConsult;
  }
  return npConsultTypeIdsFromDocs(docs);
}

async function upsertTreatmentPlans(
  locationId: number,
  subdomain: string,
  rows: NexTreatmentPlan[],
): Promise<number> {
  const col = await getCollection<TreatmentPlanDoc>(COLLECTIONS.treatmentPlans);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: TreatmentPlanDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      patientId: typeof raw.patient_id === "number" ? raw.patient_id : null,
      status: raw.status ?? null,
      raw: slimNexTreatmentPlan(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertPatients(
  locationId: number,
  subdomain: string,
  rows: NexPatient[],
): Promise<number> {
  const col = await getCollection<PatientDoc>(COLLECTIONS.patients);
  const syncedAt = nowIso();
  const byNexId = indexPatientsForPhiStrip(rows);
  let count = 0;
  for (const raw of rows) {
    const slim = stripPhiFromNexPatient(raw, byNexId);
    if (!slim) continue;
    const doc: PatientDoc = {
      locationId,
      subdomain,
      nexhealthId: slim.patientId,
      updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : null,
      syncedAt,
      patientId: slim.patientId,
      inactive: slim.inactive,
      primaryInsuranceCarrier: slim.primaryInsuranceCarrier,
      geoCity: slim.geoCity,
      geoState: slim.geoState,
      geoZip: slim.geoZip,
    };
    await col.updateOne(
      { locationId, nexhealthId: slim.patientId },
      { $set: doc, $unset: PATIENT_PHI_UNSET_FIELDS },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertGuarantorBalances(
  locationId: number,
  subdomain: string,
  rows: NexGuarantorBalance[],
): Promise<number> {
  const col = await getCollection<GuarantorBalanceDoc>(
    COLLECTIONS.guarantorBalances,
  );
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: GuarantorBalanceDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      guarantorId: typeof raw.guarantor_id === "number" ? raw.guarantor_id : null,
      raw: slimNexGuarantorBalance(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertClaims(
  locationId: number,
  subdomain: string,
  rows: NexClaim[],
): Promise<number> {
  const col = await getCollection<ClaimDoc>(COLLECTIONS.claims);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: ClaimDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      status: raw.status ?? null,
      dateOfService: raw.date_of_service ?? null,
      planId:
        typeof raw.primary_insurance_plan_id === "number"
          ? raw.primary_insurance_plan_id
          : null,
      raw: slimNexClaim(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertInsuranceBalances(
  locationId: number,
  subdomain: string,
  rows: NexInsuranceBalance[],
): Promise<number> {
  const col = await getCollection<InsuranceBalanceDoc>(
    COLLECTIONS.insuranceBalances,
  );
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: InsuranceBalanceDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      patientId: typeof raw.patient_id === "number" ? raw.patient_id : null,
      guarantorId: typeof raw.guarantor_id === "number" ? raw.guarantor_id : null,
      raw: slimNexInsuranceBalance(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

async function upsertInsurancePlans(
  locationId: number,
  subdomain: string,
  rows: NexInsurancePlan[],
): Promise<number> {
  const col = await getCollection<InsurancePlanDoc>(COLLECTIONS.insurancePlans);
  const syncedAt = nowIso();
  let count = 0;
  for (const raw of rows) {
    const id = nexId(raw);
    if (id == null) continue;
    const doc: InsurancePlanDoc = {
      locationId,
      subdomain,
      nexhealthId: id,
      updatedAt: raw.updated_at ?? null,
      syncedAt,
      name: raw.name ?? null,
      raw: slimNexInsurancePlan(raw),
    };
    await col.updateOne(
      { locationId, nexhealthId: id },
      { $set: doc },
      { upsert: true },
    );
    count += 1;
  }
  return count;
}

export async function runNexHealthWarehouseSync(
  options: SyncRunOptions = {},
): Promise<SyncResult> {
  const startedAt = nowIso();
  const trigger = options.trigger ?? "cli";
  const triggeredBy = options.triggeredBy ?? null;

  if (!isMongoConfigured()) {
    throw new Error("MONGODB_URI (or MONGODB_URL) is not set in .env.local");
  }
  if (!isNexHealthConfigured()) {
    const { missing } = nexHealthConfigStatus();
    throw new Error(`NexHealth not configured — set ${missing.join(", ")}`);
  }

  const config = getNexHealthConfig()!;
  const errors: string[] = [];
  const upserts: Record<string, number> = {};
  let nexhealthRequestCount = 0;
  const bump = () => {
    nexhealthRequestCount += 1;
  };

  await ensureWarehouseIndexes();

  let procedureRows: NexProcedure[] = [];
  let chargeRows: NexCharge[] = [];
  let treatmentPlanRows: NexTreatmentPlan[] = [];
  let appointmentTypeRows: NexAppointmentType[] = [];
  let appointmentRows: NexAppointment[] = [];
  const syncMaxPages = resolveListMaxPages();

  let locationName: string | null = null;
  try {
    bump();
    const locations = await listLocations();
    const loc0 = locations[0] as
      | { name?: string; locations?: { id: number; name?: string }[] }
      | undefined;
    if (loc0?.locations?.length) {
      const match =
        loc0.locations.find((l) => l.id === config.locationId) ||
        loc0.locations[0];
      locationName = match?.name || loc0.name || null;
    } else if (loc0?.name) {
      locationName = loc0.name;
    }
  } catch (e) {
    errors.push(
      `locations: ${e instanceof Error ? e.message : "failed"}`,
    );
  }

  const track = async (
    resource: SyncResource,
    run: (updatedSince: string) => Promise<number>,
  ) => {
    const prev = await getSyncState(config.locationId, resource);
    const updatedSince = isFullWarehouseSync()
      ? defaultUpdatedSince()
      : prev?.updatedSince || defaultUpdatedSince();
    const started = nowIso();
    try {
      bump();
      const count = await run(updatedSince);
      upserts[resource] = count;
      await saveSyncState({
        resource,
        locationId: config.locationId,
        subdomain: config.subdomain,
        updatedSince: started,
        lastRunAt: started,
        lastSuccessAt: started,
        lastError: null,
        lastUpsertCount: count,
        nexhealthRequestCount: 1,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      errors.push(`${resource}: ${msg}`);
      upserts[resource] = 0;
      await saveSyncState({
        resource,
        locationId: config.locationId,
        subdomain: config.subdomain,
        updatedSince: prev?.updatedSince ?? null,
        lastRunAt: started,
        lastSuccessAt: prev?.lastSuccessAt ?? null,
        lastError: msg,
        lastUpsertCount: 0,
        nexhealthRequestCount: 1,
      });
    }
  };

  await track("providers", async () => {
    const rows = await listProviders(200);
    return upsertProviders(config.locationId, config.subdomain, rows);
  });

  await track("appointment_types", async () => {
    appointmentTypeRows = await listAppointmentTypes(200);
    return upsertAppointmentTypes(config.locationId, config.subdomain, appointmentTypeRows);
  });

  await track("appointments", async () => {
    const range = appointmentRange();
    appointmentRows = await listAppointments({
      start: range.start,
      end: range.end,
      perPage: 1000,
      maxPages: syncMaxPages,
    });
    return upsertAppointments(config.locationId, config.subdomain, appointmentRows);
  });

  await track("procedures", async () => {
    procedureRows = await listProcedures({
      startedAfter: ymdDaysAgo(LOOKBACK_DAYS),
      startedBefore: ymdDaysAhead(1),
      maxPages: syncMaxPages,
    });
    return upsertProcedures(config.locationId, config.subdomain, procedureRows);
  });

  await track("charges", async (updatedSince) => {
    chargeRows = await listCharges({ updatedSince, maxPages: syncMaxPages });
    return upsertCharges(config.locationId, config.subdomain, chargeRows);
  });

  await track("payments", async (updatedSince) => {
    const rows = await listPayments({ updatedSince, maxPages: syncMaxPages });
    return upsertPayments(config.locationId, config.subdomain, rows);
  });

  await track("adjustments", async (updatedSince) => {
    const rows = await listAdjustments({ updatedSince, maxPages: syncMaxPages });
    return upsertAdjustments(config.locationId, config.subdomain, rows);
  });

  await track("adjustment_types", async (updatedSince) => {
    const rows = await listAdjustmentTypes({
      updatedSince,
      maxPages: syncMaxPages,
    });
    return upsertAdjustmentTypes(config.locationId, config.subdomain, rows);
  });

  await track("treatment_plans", async (updatedSince) => {
    treatmentPlanRows = await listTreatmentPlans({
      updatedSince,
      maxPages: syncMaxPages,
    });
    return upsertTreatmentPlans(
      config.locationId,
      config.subdomain,
      treatmentPlanRows,
    );
  });

  const feeLookbackSince = new Date("2020-01-01T00:00:00Z").toISOString();
  let procedureCodeFees: ReturnType<typeof buildProcedureCodeFees> | undefined;
  let feeScheduleNames: [string | null, string | null, string | null] | undefined;
  try {
    const [feeSchedules, feeScheduleProcedures] = await Promise.all([
      listFeeSchedules({ updatedSince: feeLookbackSince, maxPages: 5 }),
      listFeeScheduleProcedures({ updatedSince: feeLookbackSince, maxPages: 20 }),
    ]);
    nexhealthRequestCount += 2;
    procedureCodeFees = buildProcedureCodeFees(feeSchedules, feeScheduleProcedures);
    feeScheduleNames = procedureCodeFees.names;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fee schedule sync failed";
    errors.push(`fee_schedules: ${msg}`);
  }

  const procedureDescriptors = await listProcedureCodeDescriptors();
  nexhealthRequestCount += 1;

  const categorySync =
    await syncProcedureCategoriesFromDescriptors(procedureDescriptors);
  upserts.procedure_categories = categorySync.upserted;

  const cdtSync = await syncProcedureCodesFromNexHealth({
    procedures: procedureRows,
    charges: chargeRows,
    treatmentPlans: treatmentPlanRows,
    appointmentDescriptors: procedureDescriptors,
    procedureCategories: procedureCategoryMap(categorySync.categories),
    procedureCodeFees,
  });
  upserts.cdt_codes = cdtSync.upserted;
  if (cdtSync.removed > 0) {
    upserts.cdt_codes_removed = cdtSync.removed;
  }

  if (process.env.SYNC_CDT_CHART_JSON === "1") {
    const { mergeCdtCategoriesFromJson } = await import(
      "@/lib/mongo/merge-cdt-categories"
    );
    const chartMerge = await mergeCdtCategoriesFromJson();
    if (chartMerge.updated > 0) {
      upserts.cdt_chart_merged = chartMerge.updated;
    }
  }

  await track("patients", async (updatedSince) => {
    const rows = await listPatients({
      updatedSince,
      maxPages: syncMaxPages,
      perPage: 200,
    });
    return upsertPatients(config.locationId, config.subdomain, rows);
  });

  await track("guarantor_balances", async (updatedSince) => {
    const rows = await listGuarantorBalances({
      updatedSince,
      maxPages: syncMaxPages,
    });
    return upsertGuarantorBalances(config.locationId, config.subdomain, rows);
  });

  await track("claims", async (updatedSince) => {
    const rows = await listClaims({
      updatedSince,
      maxPages: syncMaxPages,
    });
    return upsertClaims(config.locationId, config.subdomain, rows);
  });

  await track("insurance_balances", async (updatedSince) => {
    const rows = await listInsuranceBalances({
      updatedSince,
      maxPages: syncMaxPages,
    });
    return upsertInsuranceBalances(config.locationId, config.subdomain, rows);
  });

  await track("insurance_plans", async (updatedSince) => {
    const rows = await listInsurancePlans({
      updatedSince,
      maxPages: syncMaxPages,
    });
    return upsertInsurancePlans(config.locationId, config.subdomain, rows);
  });

  const cdtCol = await getCollection<CdtCodeDoc>(COLLECTIONS.cdtCodes);
  const cdtDocs = await cdtCol.find({ locationId: config.locationId }).toArray();
  const cdtLookup =
    cdtDocs.length > 0 ? createCdtLookupFromDocs(cdtDocs) : emptyCdtLookup;
  const npConsultAppointmentTypeIds = await refreshNpConsultAppointmentTypes(
    config.locationId,
    appointmentRows,
    procedureRows,
    cdtLookup,
  );

  const lastSyncedAt = nowIso();
  const meta: WarehouseMetaDoc = {
    _id: "overview",
    locationId: config.locationId,
    subdomain: config.subdomain,
    locationName,
    lastSyncedAt: errors.length === 10 ? null : lastSyncedAt,
    lastSyncError: errors.length ? errors.join("; ") : null,
    lastNexhealthRequestCount: nexhealthRequestCount,
    feeScheduleNames,
  };
  // Keep lastSyncedAt even with partial errors so UI can show partial warehouse.
  meta.lastSyncedAt = lastSyncedAt;
  const metaCol = await getCollection<WarehouseMetaDoc>(COLLECTIONS.meta);
  await metaCol.updateOne({ _id: "overview" }, { $set: meta }, { upsert: true });

  const result: SyncResult = {
    ok: errors.length === 0,
    locationId: config.locationId,
    subdomain: config.subdomain,
    locationName,
    lastSyncedAt,
    nexhealthRequestCount,
    upserts,
    errors,
    ...(npConsultAppointmentTypeIds.length
      ? { npConsultAppointmentTypeIds }
      : {}),
  };

  try {
    await recordSyncHistory({
      startedAt,
      finishedAt: lastSyncedAt,
      ok: result.ok,
      trigger,
      triggeredBy,
      locationId: config.locationId,
      subdomain: config.subdomain,
      nexhealthRequestCount,
      upserts,
      errors,
    });
  } catch {
    // History is auxiliary — do not fail the sync job.
  }

  return result;
}
