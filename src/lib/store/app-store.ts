/**
 * Dashboard login users, password resets, and saved GHL settings.
 * Uses MongoDB when MONGODB_URL (or MONGODB_URI) is set.
 * A JSON file is used only when JSON_STORE_PATH is set (tests) or Mongo is not configured.
 * Clinical KPIs stay on Open Dental MySQL.
 */
import "server-only";

import type { Document } from "mongodb";
import { COLLECTIONS, getDb, isMongoConfigured } from "@/lib/mongo/client";
import {
  readJsonStore,
  updateJsonStore,
  type JsonStoreData,
  type StoredDashboardUser,
  type StoredPasswordReset,
} from "@/lib/store/json-store";
import type { GhlIntegrationDoc } from "@/lib/mongo/integration-settings";

let writeChain: Promise<unknown> = Promise.resolve();
let indexesReady: Promise<void> | null = null;

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Tests pin JSON_STORE_PATH so they never touch Atlas. */
export function usesMongoAppStore(): boolean {
  if (process.env.JSON_STORE_PATH?.trim()) return false;
  return isMongoConfigured();
}

function asUser(raw: Document): StoredDashboardUser {
  return {
    id: String(raw.id),
    username: String(raw.username ?? ""),
    email: String(raw.email ?? ""),
    passwordHash: String(raw.passwordHash ?? ""),
    isActive: Boolean(raw.isActive),
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
    lastPasswordReset:
      typeof raw.lastPasswordReset === "string" ? raw.lastPasswordReset : undefined,
    role: raw.role as StoredDashboardUser["role"],
    providerId:
      raw.providerId == null || raw.providerId === ""
        ? null
        : String(raw.providerId),
  };
}

function asReset(raw: Document): StoredPasswordReset {
  return {
    id: String(raw.id),
    userId: String(raw.userId ?? ""),
    email: String(raw.email ?? ""),
    resetToken: String(raw.resetToken ?? ""),
    isUsed: Boolean(raw.isUsed),
    expiresAt: String(raw.expiresAt ?? ""),
    createdAt: String(raw.createdAt ?? ""),
  };
}

async function ensureIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await db
        .collection(COLLECTIONS.dashboardUsers)
        .createIndex({ email: 1 }, { unique: true });
      await db
        .collection(COLLECTIONS.passwordResets)
        .createIndex({ resetToken: 1 }, { unique: true });
      await db.collection(COLLECTIONS.passwordResets).createIndex({ email: 1 });
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  await indexesReady;
}

async function readMongo(): Promise<JsonStoreData> {
  await ensureIndexes();
  const db = await getDb();
  const [users, resets, ghl] = await Promise.all([
    db.collection(COLLECTIONS.dashboardUsers).find({}).toArray(),
    db.collection(COLLECTIONS.passwordResets).find({}).toArray(),
    db
      .collection<GhlIntegrationDoc>(COLLECTIONS.integrationSettings)
      .findOne({ _id: "ghl" }),
  ]);
  return {
    dashboardUsers: users.map(asUser),
    passwordResets: resets.map(asReset),
    ghl: ghl ?? null,
  };
}

async function writeMongo(store: JsonStoreData): Promise<void> {
  await ensureIndexes();
  const db = await getDb();
  const users = db.collection(COLLECTIONS.dashboardUsers);
  const resets = db.collection(COLLECTIONS.passwordResets);
  const settings = db.collection<GhlIntegrationDoc>(COLLECTIONS.integrationSettings);

  await users.deleteMany({});
  if (store.dashboardUsers.length > 0) {
    await users.insertMany(store.dashboardUsers.map((user) => ({ ...user })));
  }

  await resets.deleteMany({});
  if (store.passwordResets.length > 0) {
    await resets.insertMany(store.passwordResets.map((row) => ({ ...row })));
  }

  if (store.ghl) {
    await settings.replaceOne({ _id: "ghl" }, store.ghl, { upsert: true });
  } else {
    await settings.deleteOne({ _id: "ghl" });
  }
}

export async function readAppStore(): Promise<JsonStoreData> {
  if (!usesMongoAppStore()) return readJsonStore();
  return withLock(() => readMongo());
}

export async function updateAppStore(
  mutate: (store: JsonStoreData) => void,
): Promise<JsonStoreData> {
  if (!usesMongoAppStore()) return updateJsonStore(mutate);
  return withLock(async () => {
    const store = await readMongo();
    mutate(store);
    await writeMongo(store);
    return store;
  });
}
