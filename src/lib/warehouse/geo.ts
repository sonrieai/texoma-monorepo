/**
 * City-level geographic aggregates from the de-identified patient index.
 * Geocodes city keys ("City, ST") — never street addresses.
 */

import { geocodeAddressQueries, normalizeGeocodeKey } from "@/lib/geo/geocode";
import { isOpenDentalMysqlConfigured } from "@/lib/opendental/config";
import { getOdClinicNums } from "@/lib/opendental/location";
import {
  listOdPatientGeoRows,
  listOdProductionCentsByPatient,
} from "@/lib/opendental/queries";
import { readCachedOpenDentalSnapshot } from "@/lib/opendental/snapshot";
import {
  aggregateProductionCentsByCity,
  buildPatientCityIndex,
  TEXOMA_REGION_COUNTY_COUNT,
  UNKNOWN_ADDRESS_LABEL,
  type PatientCityRow,
} from "@/lib/warehouse/geo-production";

export { UNKNOWN_ADDRESS_LABEL };
import {
  cityLabel,
  formatGeocodeQuery,
  hasGeocodableAddress,
  type PatientAddress,
} from "@/lib/warehouse/patient-address";
import type { GeoCity } from "@/lib/types/viz";
import type { PeriodRange } from "@/lib/ui/period";

export type GeoSummary = {
  available: boolean;
  cities: GeoCity[];
  mapCities: GeoCity[];
  totalPatients: number;
  patientsWithAddress: number;
  patientsGeocoded: number;
  geocodeLookups: number;
  totalProductionCents: number;
  countiesReached: number;
  regionCountyCount: number;
  notices: string[];
};

type CityAgg = {
  city: string;
  county: string | null;
  patients: number;
  latSum: number;
  lonSum: number;
  coordCount: number;
  sampleQuery: string | null;
};

export type PatientGeoIndex = PatientCityRow & {
  inactive: boolean;
};

function addressFromIndex(p: PatientGeoIndex): PatientAddress {
  return {
    addressLine: null,
    city: p.city,
    state: p.state,
    postalCode: p.zip,
    county: null,
    latitude: null,
    longitude: null,
  };
}

function trimOrNull(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function patientsFromGeoRows(
  rows: {
    PatNum: number;
    City: string | null;
    State: string | null;
    Zip: string | null;
    PatStatus: number;
  }[],
): PatientGeoIndex[] {
  return rows
    .filter((row) => Number(row.PatStatus) === 0)
    .map((row) => ({
      patientId: row.PatNum,
      inactive: false,
      city: trimOrNull(row.City),
      state: trimOrNull(row.State),
      zip: trimOrNull(row.Zip),
    }));
}

function productionFromPatientCents(
  patients: PatientCityRow[],
  centsByPatient: { PatNum: number; Cents: number }[],
): Map<string, number> {
  const patientCity = buildPatientCityIndex(patients);
  const byCity = new Map<string, number>();
  for (const row of centsByPatient) {
    const cents = Number(row.Cents);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    const city = patientCity.get(row.PatNum);
    if (!city) continue;
    byCity.set(city, (byCity.get(city) ?? 0) + cents);
  }
  return byCity;
}

const GEO_SUMMARY_TTL_MS = 5 * 60 * 1000;
const GEO_SUMMARY_LIMIT = 8;

type GeoSummaryCache = Map<string, { cachedAtMs: number; summary: GeoSummary }>;

const geoSummaryCache: GeoSummaryCache = ((
  globalThis as { __texomaGeoSummary?: GeoSummaryCache }
).__texomaGeoSummary ??= new Map());

function geoSummaryKey(range?: PeriodRange): string {
  return range ? `${range.start}|${range.end}` : "all";
}

function readGeoSummaryCache(key: string): GeoSummary | null {
  const hit = geoSummaryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.cachedAtMs > GEO_SUMMARY_TTL_MS) {
    geoSummaryCache.delete(key);
    return null;
  }
  return hit.summary;
}

function writeGeoSummaryCache(key: string, summary: GeoSummary): GeoSummary {
  if (geoSummaryCache.size >= GEO_SUMMARY_LIMIT) {
    const oldest = geoSummaryCache.keys().next().value;
    if (oldest) geoSummaryCache.delete(oldest);
  }
  geoSummaryCache.set(key, { cachedAtMs: Date.now(), summary });
  return summary;
}

function patientGeoIndexFromSnapshot(
  snapshot: NonNullable<ReturnType<typeof readCachedOpenDentalSnapshot>>,
): PatientGeoIndex[] {
  return snapshot.patients.map((patient) => ({
    patientId: patient.patientId,
    inactive: patient.inactive,
    city: patient.geoCity,
    state: patient.geoState,
    zip: patient.geoZip,
  }));
}

export async function loadPatientGeoIndex(): Promise<PatientGeoIndex[]> {
  if (!isOpenDentalMysqlConfigured()) {
    throw new Error(
      "Open Dental MySQL is not configured. Set OD_MYSQL_HOST, OD_MYSQL_USER, OD_MYSQL_DB, and OD_MYSQL_PASS.",
    );
  }

  const snapshot = readCachedOpenDentalSnapshot();
  if (snapshot) return patientGeoIndexFromSnapshot(snapshot).filter((p) => !p.inactive);

  return patientsFromGeoRows(await listOdPatientGeoRows());
}

export async function loadGeoSummary(
  range?: PeriodRange,
): Promise<GeoSummary> {
  const cacheKey = geoSummaryKey(range);
  const cached = readGeoSummaryCache(cacheKey);
  if (cached) return cached;

  const notices: string[] = [];
  let patients: PatientGeoIndex[] = [];
  let productionByCity = new Map<string, number>();

  try {
    if (!isOpenDentalMysqlConfigured()) {
      throw new Error(
        "Open Dental MySQL is not configured. Set OD_MYSQL_HOST, OD_MYSQL_USER, OD_MYSQL_DB, and OD_MYSQL_PASS.",
      );
    }
    const snapshot = readCachedOpenDentalSnapshot();
    if (snapshot) {
      patients = patientGeoIndexFromSnapshot(snapshot).filter(
        (patient) => !patient.inactive,
      );
      productionByCity = aggregateProductionCentsByCity(
        patients,
        snapshot.charges,
        range,
      );
    } else {
      const window = {
        startYmd: range?.start ?? "2000-01-01",
        endYmd: range?.end ?? new Date().toISOString().slice(0, 10),
      };
      const [patientRows, feeRows] = await Promise.all([
        listOdPatientGeoRows(),
        listOdProductionCentsByPatient(window, getOdClinicNums()),
      ]);
      patients = patientsFromGeoRows(patientRows);
      productionByCity = productionFromPatientCents(patients, feeRows);
    }
  } catch (e) {
    return {
      available: false,
      cities: [],
      mapCities: [],
      totalPatients: 0,
      patientsWithAddress: 0,
      patientsGeocoded: 0,
      geocodeLookups: 0,
      totalProductionCents: 0,
      countiesReached: 0,
      regionCountyCount: TEXOMA_REGION_COUNTY_COUNT,
      notices: [
        e instanceof Error ? e.message : "Patient list unavailable from Open Dental.",
      ],
    };
  }

  if (patients.length === 0) {
    notices.push("No patients returned from Open Dental for this connection.");
  }

  const withAddress = patients.filter((p) =>
    hasGeocodableAddress(addressFromIndex(p)),
  );

  if (withAddress.length === 0 && patients.length > 0) {
    notices.push("No city/state/ZIP on patient records in Open Dental.");
  }

  const byCity = new Map<string, CityAgg>();

  for (const p of patients) {
    const addr = addressFromIndex(p);
    const label = cityLabel(addr) ?? UNKNOWN_ADDRESS_LABEL;

    let row = byCity.get(label);
    if (!row) {
      row = {
        city: label,
        county: null,
        patients: 0,
        latSum: 0,
        lonSum: 0,
        coordCount: 0,
        sampleQuery:
          label === UNKNOWN_ADDRESS_LABEL ? null : formatGeocodeQuery(addr),
      };
      byCity.set(label, row);
    }

    row.patients += 1;
    if (!row.sampleQuery) row.sampleQuery = formatGeocodeQuery(addr);
  }

  const queriesToGeocode = [...byCity.values()]
    .filter((row) => row.coordCount === 0 && row.sampleQuery)
    .sort((a, b) => b.patients - a.patients)
    .map((row) => row.sampleQuery as string);

  const geocoded = await geocodeAddressQueries(queriesToGeocode);
  let geocodeHits = 0;

  for (const row of byCity.values()) {
    if (row.coordCount > 0 || !row.sampleQuery) continue;
    const key = normalizeGeocodeKey(row.sampleQuery);
    const hit = geocoded.get(key);
    if (!hit) continue;
    row.latSum = hit.lat;
    row.lonSum = hit.lon;
    row.coordCount = 1;
    if (hit.county) row.county = hit.county;
    geocodeHits += 1;
  }

  const cities: GeoCity[] = [...byCity.values()]
    .map((row) => ({
      city: row.city,
      county: row.county,
      lat: row.coordCount > 0 ? row.latSum / row.coordCount : null,
      lon: row.coordCount > 0 ? row.lonSum / row.coordCount : null,
      patients: row.patients,
      production: Math.round((productionByCity.get(row.city) ?? 0) / 100),
    }))
    .sort((a, b) => (b.production ?? 0) - (a.production ?? 0) || b.patients - a.patients);

  const mapCities = cities.filter((c) => c.lat != null && c.lon != null);

  const totalProductionCents = [...productionByCity.values()].reduce(
    (sum, cents) => sum + cents,
    0,
  );
  const countiesReached = new Set(
    cities.map((c) => c.county).filter((c): c is string => Boolean(c?.trim())),
  ).size;

  const patientsGeocoded = withAddress.filter((p) => {
    const label = cityLabel(addressFromIndex(p));
    if (!label) return false;
    const row = byCity.get(label);
    return row != null && row.coordCount > 0;
  }).length;

  notices.push(
    `${withAddress.length} patients with city/ZIP · ${mapCities.length} cities on map (${geocodeHits} city keys geocoded).`,
  );
  const unknownPatients = byCity.get(UNKNOWN_ADDRESS_LABEL)?.patients ?? 0;
  if (unknownPatients > 0) {
    notices.push(
      `${unknownPatients} patients have no city, state, or ZIP in Open Dental. Their production is listed as Unknown address.`,
    );
  }
  if (withAddress.length > 0 && mapCities.length === 0) {
    notices.push(
      "City/state present but geocoding returned no matches — verify city/state/ZIP.",
    );
  }
  if (queriesToGeocode.length > geocodeHits) {
    notices.push(
      `Geocoded ${geocodeHits} of ${queriesToGeocode.length} unique city key(s) this load. Refresh to resolve remaining cities.`,
    );
  }

  return writeGeoSummaryCache(cacheKey, {
    available: true,
    cities,
    mapCities,
    totalPatients: patients.length,
    patientsWithAddress: withAddress.length,
    patientsGeocoded,
    geocodeLookups: geocoded.size,
    totalProductionCents,
    countiesReached,
    regionCountyCount: TEXOMA_REGION_COUNTY_COUNT,
    notices,
  });
}

/** Debug tooling: coverage of de-identified geo fields. */
export function summarizePatientGeoFields(
  patients: PatientGeoIndex[],
): { total: number; withCity: number; withState: number; withZip: number } {
  let withCity = 0;
  let withState = 0;
  let withZip = 0;
  for (const p of patients) {
    if (p.city) withCity += 1;
    if (p.state) withState += 1;
    if (p.zip) withZip += 1;
  }
  return { total: patients.length, withCity, withState, withZip };
}
