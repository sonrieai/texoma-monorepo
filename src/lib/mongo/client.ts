/**
 * Server-only MongoDB client for dashboard login and GHL settings.
 * Clinical KPIs read live from Open Dental MySQL — not from Mongo.
 */

import { MongoClient, type Db, type Collection, type Document } from "mongodb";

export const MONGODB_DB_DEFAULT = "texoma";

export const COLLECTIONS = {
  integrationSettings: "integration_settings",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

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

/** Close the shared Mongo client (CLI / tests). */
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
