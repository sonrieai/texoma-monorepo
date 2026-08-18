import type { NexPatient } from "@/lib/nexhealth/client";

/** Normalized address from NexHealth / Open Dental sync (PHI — geo + patients tab only). */
export type PatientAddress = {
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
};

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseFloat(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function firstString(
  sources: Record<string, unknown>[],
  keys: string[],
): string | null {
  for (const src of sources) {
    for (const key of keys) {
      const hit = readString(src[key]);
      if (hit) return hit;
    }
  }
  return null;
}

function firstNumber(
  sources: Record<string, unknown>[],
  keys: string[],
): number | null {
  for (const src of sources) {
    for (const key of keys) {
      const hit = readNumber(src[key]);
      if (hit != null) return hit;
    }
  }
  return null;
}

function nestedRecord(
  obj: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

/** Pull address fields from NexHealth patient (top-level, bio, nested home_address). */
export function extractPatientAddress(p: NexPatient): PatientAddress {
  const bio =
    p.bio && typeof p.bio === "object" ? (p.bio as Record<string, unknown>) : undefined;
  const top = p as Record<string, unknown>;

  const home = nestedRecord(bio, [
    "home_address",
    "homeAddress",
    "address",
    "mailing_address",
    "mailingAddress",
  ]);
  const nested = nestedRecord(top, [
    "home_address",
    "homeAddress",
    "address",
    "mailing_address",
  ]);

  const sources = [top, bio ?? {}, home ?? {}, nested ?? {}].filter(
    (s) => Object.keys(s).length > 0,
  );

  const line1 = firstString(sources, [
    "address_line_1",
    "address_line1",
    "street_address",
    "street",
    "address1",
    "addr1",
    "address",
    "line1",
  ]);
  const line2 = firstString(sources, [
    "address_line_2",
    "address_line2",
    "address2",
    "addr2",
    "line2",
  ]);
  const addressLine = [line1, line2].filter(Boolean).join(", ") || null;

  const city = firstString(sources, ["city", "town", "municipality"]);
  const state = firstString(sources, [
    "state",
    "province",
    "state_code",
    "region",
  ]);
  const postalCode = firstString(sources, [
    "zip_code",
    "zip",
    "postal_code",
    "postalCode",
    "zipcode",
  ]);
  const county = firstString(sources, ["county", "county_name"]);

  const latitude = firstNumber(sources, [
    "latitude",
    "lat",
    "geo_lat",
    "y",
  ]);
  const longitude = firstNumber(sources, [
    "longitude",
    "lon",
    "lng",
    "geo_lon",
    "x",
  ]);

  return {
    addressLine,
    city,
    state,
    postalCode,
    county,
    latitude,
    longitude,
  };
}

function isFilledAddress(addr: PatientAddress): boolean {
  return Boolean(
    addr.addressLine?.trim() ||
      addr.city?.trim() ||
      addr.state?.trim() ||
      addr.postalCode?.trim() ||
      (addr.latitude != null && addr.longitude != null),
  );
}

/** Fill missing address fields from guarantor / head-of-household when NexHealth omits them on dependents. */
export function mergePatientAddress(
  primary: PatientAddress,
  fallback: PatientAddress,
): PatientAddress {
  return {
    addressLine: primary.addressLine || fallback.addressLine,
    city: primary.city || fallback.city,
    state: primary.state || fallback.state,
    postalCode: primary.postalCode || fallback.postalCode,
    county: primary.county || fallback.county,
    latitude: primary.latitude ?? fallback.latitude,
    longitude: primary.longitude ?? fallback.longitude,
  };
}

export function resolvePatientAddress(
  p: NexPatient,
  byNexId: Map<number, NexPatient>,
): PatientAddress {
  const own = extractPatientAddress(p);
  if (hasGeocodableAddress(own)) return own;

  const guarantorId =
    typeof p.guarantor_id === "number" ? p.guarantor_id : null;
  if (!guarantorId || guarantorId === p.id) return own;

  const guarantor = byNexId.get(guarantorId);
  if (!guarantor) return own;

  const fromGuarantor = extractPatientAddress(guarantor);
  if (!isFilledAddress(fromGuarantor)) return own;

  return mergePatientAddress(own, fromGuarantor);
}

export function indexPatientsByNexId(
  patients: NexPatient[],
): Map<number, NexPatient> {
  const byNexId = new Map<number, NexPatient>();
  for (const p of patients) {
    if (typeof p.id === "number") byNexId.set(p.id, p);
  }
  return byNexId;
}

export function hasGeocodableAddress(addr: PatientAddress): boolean {
  if (addr.latitude != null && addr.longitude != null) return true;
  if (addr.city?.trim() && addr.state?.trim()) return true;
  if (addr.postalCode?.trim() && addr.state?.trim()) return true;
  if (addr.addressLine?.trim() && (addr.city?.trim() || addr.postalCode?.trim())) {
    return true;
  }
  // International / freeform OD address when city/state not mapped by NexHealth.
  if (addr.addressLine?.trim() && addr.addressLine.trim().length >= 2) return true;
  return false;
}

/** Single-line query for US Census / Nominatim (derived from synced OD fields). */
export function formatGeocodeQuery(addr: PatientAddress): string | null {
  if (addr.latitude != null && addr.longitude != null) return null;

  const parts: string[] = [];
  if (addr.addressLine) parts.push(addr.addressLine);
  if (addr.city) parts.push(addr.city);
  if (addr.state) parts.push(addr.state);
  if (addr.postalCode) parts.push(addr.postalCode);
  if (parts.length === 0) return null;

  const hasCityState = Boolean(addr.city && addr.state);
  const hasZipState = Boolean(addr.postalCode && addr.state);
  if (!hasCityState && !hasZipState && !addr.addressLine) return null;
  if (!hasCityState && !hasZipState && addr.addressLine) return addr.addressLine.trim();

  return parts.join(", ");
}

export function cityLabel(addr: PatientAddress): string | null {
  const city = addr.city?.trim();
  if (!city) {
    if (addr.postalCode?.trim() && addr.state?.trim()) {
      return `ZIP ${addr.postalCode.trim()}, ${addr.state.trim()}`;
    }
    if (addr.addressLine?.trim() && !addr.state?.trim() && !addr.postalCode?.trim()) {
      return addr.addressLine.trim();
    }
    return null;
  }
  const st = addr.state?.trim();
  return st ? `${city}, ${st}` : city;
}
