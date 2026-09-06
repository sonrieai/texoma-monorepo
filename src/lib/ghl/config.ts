import "server-only";

import type { GhlConfig } from "@/lib/ghl/types";
import {
  decryptGhlApiKey,
  defaultGhlBaseUrl,
  getGhlIntegrationDoc,
} from "@/lib/mongo/integration-settings";
import { isMongoConfigured } from "@/lib/mongo/client";

export type { GhlConfig } from "@/lib/ghl/types";

export class GhlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhlConfigError";
  }
}

export type GhlConfigSource = "mongo" | "env";

function normalizeBaseUrl(raw: string | undefined | null): string {
  return (raw?.trim() || defaultGhlBaseUrl()).replace(/\/$/, "");
}

export function isGhlConfiguredFromEnv(): boolean {
  return Boolean(
    process.env.GHL_API_KEY?.trim() && process.env.GHL_LOCATION_ID?.trim(),
  );
}

function getGhlConfigFromEnv(): GhlConfig | null {
  const apiKey = process.env.GHL_API_KEY?.trim();
  const locationId = process.env.GHL_LOCATION_ID?.trim();
  if (!apiKey || !locationId) return null;
  return {
    apiKey,
    locationId,
    baseUrl: normalizeBaseUrl(process.env.GHL_BASE_URL),
    sourceCustomFieldId:
      process.env.GHL_SOURCE_CUSTOM_FIELD_ID?.trim() || null,
  };
}

async function getGhlConfigFromMongo(): Promise<GhlConfig | null> {
  if (!isMongoConfigured()) return null;
  const doc = await getGhlIntegrationDoc();
  if (!doc?.apiKeyEncrypted?.trim() || !doc.locationId?.trim()) return null;
  try {
    const apiKey = await decryptGhlApiKey(doc);
    if (!apiKey.trim()) return null;
    return {
      apiKey,
      locationId: doc.locationId.trim(),
      baseUrl: normalizeBaseUrl(doc.baseUrl),
      sourceCustomFieldId: doc.sourceCustomFieldId?.trim() || null,
    };
  } catch {
    return null;
  }
}

export async function resolveGhlConfigSource(): Promise<GhlConfigSource | null> {
  const mongo = await getGhlConfigFromMongo();
  if (mongo) return "mongo";
  if (isGhlConfiguredFromEnv()) return "env";
  return null;
}

/** True when Mongo integration doc or env vars provide GHL credentials. */
export async function isGhlConfigured(): Promise<boolean> {
  return (await resolveGhlConfigSource()) != null;
}

/** Mongo-first, then env fallback for local dev. */
export async function getGhlConfig(): Promise<GhlConfig> {
  const mongo = await getGhlConfigFromMongo();
  if (mongo) return mongo;
  const env = getGhlConfigFromEnv();
  if (env) return env;
  throw new GhlConfigError(
    "GoHighLevel is not configured. Add credentials in Settings → GoHighLevel or set GHL_API_KEY and GHL_LOCATION_ID in .env.local.",
  );
}
