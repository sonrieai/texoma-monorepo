import "server-only";

import type { GhlConfig } from "@/lib/ghl/types";
import {
  decryptGhlApiKey,
  defaultGhlBaseUrl,
  getGhlIntegrationDoc,
} from "@/lib/mongo/integration-settings";

export type { GhlConfig } from "@/lib/ghl/types";

export class GhlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhlConfigError";
  }
}

export type GhlConfigSource = "json" | "env";

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

async function getGhlConfigFromJson(): Promise<GhlConfig | null> {
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
  const saved = await getGhlConfigFromJson();
  if (saved) return "json";
  if (isGhlConfiguredFromEnv()) return "env";
  return null;
}

/** True when the JSON settings file or env vars provide GHL credentials. */
export async function isGhlConfigured(): Promise<boolean> {
  return (await resolveGhlConfigSource()) != null;
}

/** Saved JSON settings first, then env fallback. */
export async function getGhlConfig(): Promise<GhlConfig> {
  const saved = await getGhlConfigFromJson();
  if (saved) return saved;
  const env = getGhlConfigFromEnv();
  if (env) return env;
  throw new GhlConfigError(
    "GoHighLevel is not configured. Add credentials in Settings → GoHighLevel or set GHL_API_KEY and GHL_LOCATION_ID in .env.local.",
  );
}
