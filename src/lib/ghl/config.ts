import "server-only";

import { cache } from "react";
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

/** Texoma Dentures & Implants sub-account — OD → GHL sync is locked to this location. */
export const TEXOMA_GHL_LOCATION_ID = "m7Fk4S7LR8eTebuM3QPh";

function normalizeBaseUrl(raw: string | undefined | null): string {
  return (raw?.trim() || defaultGhlBaseUrl()).replace(/\/$/, "");
}

/** Reject any GHL config that is not the Texoma location. */
export function assertTexomaGhlLocation(config: GhlConfig): GhlConfig {
  if (config.locationId !== TEXOMA_GHL_LOCATION_ID) {
    throw new GhlConfigError(
      `GoHighLevel location ${config.locationId} is not Texoma (${TEXOMA_GHL_LOCATION_ID}). OD sync only writes to the Texoma sub-account.`,
    );
  }
  return config;
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

const getGhlConfigFromJson = cache(async (): Promise<GhlConfig | null> => {
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
});

export const resolveGhlConfigSource = cache(
  async (): Promise<GhlConfigSource | null> => {
  const saved = await getGhlConfigFromJson();
  if (saved) return "json";
  if (isGhlConfiguredFromEnv()) return "env";
  return null;
  },
);

/** True when saved settings or env vars provide GHL credentials. */
export const isGhlConfigured = cache(async (): Promise<boolean> => {
  return (await resolveGhlConfigSource()) != null;
});

/** Saved settings first, then env fallback. */
export const getGhlConfig = cache(async (): Promise<GhlConfig> => {
  const saved = await getGhlConfigFromJson();
  if (saved) return saved;
  const env = getGhlConfigFromEnv();
  if (env) return env;
  throw new GhlConfigError(
    "GoHighLevel is not configured. Add credentials in Settings → GoHighLevel or set GHL_API_KEY and GHL_LOCATION_ID in .env.local.",
  );
});
