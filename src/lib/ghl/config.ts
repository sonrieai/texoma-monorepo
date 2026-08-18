export type GhlConfig = {
  apiKey: string;
  locationId: string;
  baseUrl: string;
  /** Optional custom field id that stores lead source (Texoma: lzdwJx2UWkIZtVfCjSNr). */
  sourceCustomFieldId: string | null;
};

export class GhlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhlConfigError";
  }
}

export function isGhlConfigured(): boolean {
  return Boolean(
    process.env.GHL_API_KEY?.trim() && process.env.GHL_LOCATION_ID?.trim(),
  );
}

export function getGhlConfig(): GhlConfig {
  const apiKey = process.env.GHL_API_KEY?.trim();
  const locationId = process.env.GHL_LOCATION_ID?.trim();
  if (!apiKey || !locationId) {
    throw new GhlConfigError(
      "Set GHL_API_KEY and GHL_LOCATION_ID in .env.local",
    );
  }
  return {
    apiKey,
    locationId,
    baseUrl: (
      process.env.GHL_BASE_URL?.trim() ||
      "https://services.leadconnectorhq.com"
    ).replace(/\/$/, ""),
    sourceCustomFieldId:
      process.env.GHL_SOURCE_CUSTOM_FIELD_ID?.trim() || null,
  };
}
