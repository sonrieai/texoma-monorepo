/**
 * Server-only MongoDB Atlas client for the Texoma KPI warehouse.
 * Dashboard pages read from here; NexHealth is only used by the sync job.
 * (No `server-only` import here — the sync CLI imports this module via tsx.)
 */

import { MongoClient, type Db, type Collection, type Document } from "mongodb";

export const MONGODB_DB_DEFAULT = "texoma";

export const COLLECTIONS = {
  syncState: "sync_state",
  providers: "providers",
  appointmentTypes: "appointment_types",
  appointments: "appointments",
  procedures: "procedures",
  charges: "charges",
  payments: "payments",
  adjustments: "adjustments",
  treatmentPlans: "treatment_plans",
  patients: "patients",
  guarantorBalances: "guarantor_balances",
  claims: "claims",
  insuranceBalances: "insurance_balances",
  insurancePlans: "insurance_plans",
  cdtCodes: "cdt_codes",
  procedureCategories: "procedure_categories",
  meta: "meta",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export type SyncResource =
  | "providers"
  | "appointment_types"
  | "appointments"
  | "procedures"
  | "charges"
  | "payments"
  | "adjustments"
  | "treatment_plans"
  | "patients"
  | "guarantor_balances"
  | "claims"
  | "insurance_balances"
  | "insurance_plans";

export type SyncStateDoc = {
  resource: SyncResource;
  locationId: number;
  subdomain: string;
  updatedSince: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastUpsertCount: number;
  nexhealthRequestCount: number;
};

export type WarehouseMetaDoc = {
  _id: "overview";
  locationId: number;
  subdomain: string;
  locationName: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastNexhealthRequestCount: number;
  /** Labels for procedure code fee columns (from NexHealth fee schedules). */
  feeScheduleNames?: [string | null, string | null, string | null];
};

let clientPromise: Promise<MongoClient> | null = null;

/** Accept MONGODB_URI (preferred) or MONGODB_URL (Atlas console style). */
export function getMongoUri(): string | null {
  const uri =
    process.env.MONGODB_URI?.trim() || process.env.MONGODB_URL?.trim() || "";
  return uri || null;
}

export function isMongoConfigured(): boolean {
  return Boolean(getMongoUri());
}

export function getMongoDbName(): string {
  return process.env.MONGODB_DB?.trim() || MONGODB_DB_DEFAULT;
}

export async function getMongoClient(): Promise<MongoClient> {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error(
      "MONGODB_URI (or MONGODB_URL) is not set. Add your Atlas connection string to .env.local.",
    );
  }

  if (!clientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
    clientPromise = client.connect();
  }

  return clientPromise;
}

/** Close the shared Mongo client (CLI sync / tests). */
export async function closeMongoClient(): Promise<void> {
  if (!clientPromise) return;
  const client = await clientPromise;
  await client.close();
  clientPromise = null;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getMongoDbName());
}

export async function getCollection<T extends Document = Document>(
  name: CollectionName,
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

/** Create unique + query indexes once (safe to call repeatedly). */
export async function ensureWarehouseIndexes(): Promise<void> {
  const db = await getDb();

  await db.collection(COLLECTIONS.syncState).createIndex(
    { locationId: 1, resource: 1 },
    { unique: true, name: "loc_resource_uq" },
  );

  const entityCollections = [
    COLLECTIONS.providers,
    COLLECTIONS.appointmentTypes,
    COLLECTIONS.appointments,
    COLLECTIONS.procedures,
    COLLECTIONS.charges,
    COLLECTIONS.payments,
    COLLECTIONS.adjustments,
    COLLECTIONS.treatmentPlans,
    COLLECTIONS.patients,
    COLLECTIONS.guarantorBalances,
    COLLECTIONS.claims,
    COLLECTIONS.insuranceBalances,
    COLLECTIONS.insurancePlans,
  ] as const;

  for (const name of entityCollections) {
    const col = db.collection(name);
    await col.createIndex(
      { locationId: 1, nexhealthId: 1 },
      { unique: true, name: "loc_nex_uq" },
    );
    await col.createIndex({ locationId: 1, updatedAt: 1 }, { name: "loc_updated" });
  }

  await db
    .collection(COLLECTIONS.appointments)
    .createIndex({ locationId: 1, startTime: 1 }, { name: "loc_start" });
  await db
    .collection(COLLECTIONS.appointments)
    .createIndex({ locationId: 1, providerId: 1 }, { name: "loc_provider" });
  await db
    .collection(COLLECTIONS.procedures)
    .createIndex({ locationId: 1, procedureCode: 1 }, { name: "loc_code" });
  await db
    .collection(COLLECTIONS.procedures)
    .createIndex({ locationId: 1, startDate: 1 }, { name: "loc_start_date" });
  await db
    .collection(COLLECTIONS.charges)
    .createIndex({ locationId: 1, procedureCode: 1 }, { name: "loc_code" });
  await db
    .collection(COLLECTIONS.charges)
    .createIndex({ locationId: 1, chargedAt: 1 }, { name: "loc_charged" });
  await db
    .collection(COLLECTIONS.charges)
    .createIndex({ locationId: 1, patientId: 1 }, { name: "loc_patient" });
  await db
    .collection(COLLECTIONS.payments)
    .createIndex({ locationId: 1, paidAt: 1 }, { name: "loc_paid" });
  await db
    .collection(COLLECTIONS.adjustments)
    .createIndex({ locationId: 1, adjustedAt: 1 }, { name: "loc_adjusted" });
  await db
    .collection(COLLECTIONS.treatmentPlans)
    .createIndex({ locationId: 1, status: 1 }, { name: "loc_status" });
  await db
    .collection(COLLECTIONS.patients)
    .createIndex({ locationId: 1, patientId: 1 }, { name: "loc_patient" });
  await db
    .collection(COLLECTIONS.cdtCodes)
    .createIndex({ code: 1 }, { unique: true, name: "code_uq" });
}
