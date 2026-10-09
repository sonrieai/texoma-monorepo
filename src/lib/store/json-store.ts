/**
 * Local JSON file for dashboard login users and saved GHL settings.
 * Clinical KPIs stay on Open Dental MySQL.
 */
import "server-only";

import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GhlIntegrationDoc } from "@/lib/mongo/integration-settings";

export type StoredDashboardUser = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastPasswordReset?: string;
};

export type StoredPasswordReset = {
  id: string;
  userId: string;
  email: string;
  resetToken: string;
  isUsed: boolean;
  expiresAt: string;
  createdAt: string;
};

export type JsonStoreData = {
  dashboardUsers: StoredDashboardUser[];
  passwordResets: StoredPasswordReset[];
  ghl: GhlIntegrationDoc | null;
};

function emptyStore(): JsonStoreData {
  return { dashboardUsers: [], passwordResets: [], ghl: null };
}

/** Override with JSON_STORE_PATH. Default is data/store.json in the app directory. */
export function getJsonStorePath(): string {
  const override = process.env.JSON_STORE_PATH?.trim();
  if (override) return override;
  return path.join(process.cwd(), "data", "store.json");
}

function normalizeStore(raw: unknown): JsonStoreData {
  const parsed = raw && typeof raw === "object" ? (raw as Partial<JsonStoreData>) : {};
  return {
    dashboardUsers: Array.isArray(parsed.dashboardUsers) ? parsed.dashboardUsers : [],
    passwordResets: Array.isArray(parsed.passwordResets) ? parsed.passwordResets : [],
    ghl: parsed.ghl && typeof parsed.ghl === "object" ? parsed.ghl : null,
  };
}

async function readStore(): Promise<JsonStoreData> {
  try {
    const raw = await readFile(getJsonStorePath(), "utf8");
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw err;
  }
}

async function writeStore(data: JsonStoreData): Promise<void> {
  const filePath = getJsonStorePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await copyFile(tmp, filePath);
  await unlink(tmp).catch(() => undefined);
}

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function readJsonStore(): Promise<JsonStoreData> {
  return withLock(() => readStore());
}

export async function updateJsonStore(
  mutate: (store: JsonStoreData) => void,
): Promise<JsonStoreData> {
  return withLock(async () => {
    const store = await readStore();
    mutate(store);
    await writeStore(store);
    return store;
  });
}
