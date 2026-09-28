/**
 * City-level geographic aggregates from the de-identified patient index.
 * Geocodes city keys ("City, ST") — never street addresses.
 */

import { geocodeAddressQueries, normalizeGeocodeKey } from "@/lib/geo/geocode";
import { loadOpenDentalSnapshot } from "@/lib/opendental/snapshot";
import { isOpenDentalMysqlConfigured } from "@/lib/opendental/config";
import {
  aggregateProductionCentsByCity,
  TEXOMA_REGION_COUNTY_COUNT,
  type PatientCityRow,
} from "@/lib/warehouse/geo-production";
import {
  cityLabel,
  formatGeocodeQuery,
  hasGeocodableAddress,
  type PatientAddress,
} from "@/lib/warehouse/patient-address";
import type { GeoCity } from "@/lib/types/viz";

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

export async function loadPatientGeoIndex(): Promise<PatientGeoIndex[]> {
  if (!isOpenDentalMysqlConfigured()) {
    throw new Error(
      "Open Dental MySQL is not configured. Set OD_MYSQL_HOST, OD_MYSQL_USER, OD_MYSQL_DB, and OD_MYSQL_PASS.",
    );
  }

  const snapshot = await loadOpenDentalSnapshot();
  return snapshot.patients.map((d) => ({
    patientId: d.patientId,
    inactive: d.inactive,
    city: d.geoCity,
    state: d.geoState,
    zip: d.geoZip,
  }));
}

export async function loadGeoSummary(): Promise<GeoSummary> {
  const notices: string[] = [];
  let patients: PatientGeoIndex[] = [];

  try {
    patients = (await loadPatientGeoIndex()).filter((p) => !p.inactive);
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

  if (withAddress.length === 0) {
    notices.push("No city/state/ZIP on patient records in Open Dental.");
    return {
      available: true,
      cities: [],
      mapCities: [],
      totalPatients: patients.length,
      patientsWithAddress: 0,
      patientsGeocoded: 0,
      geocodeLookups: 0,
      totalProductionCents: 0,
      countiesReached: 0,
      regionCountyCount: TEXOMA_REGION_COUNTY_COUNT,
      notices,
    };
  }

  let productionByCity = new Map<string, number>();
  try {
    const snapshot = await loadOpenDentalSnapshot();
    productionByCity = aggregateProductionCentsByCity(
      withAddress,
      snapshot.charges,
    );
  } catch {
    notices.push("Charges unavailable — production by city shows $0.");
  }

  const byCity = new Map<string, CityAgg>();

  for (const p of withAddress) {
    const addr = addressFromIndex(p);
    const label = cityLabel(addr);
    if (!label) continue;

    let row = byCity.get(label);
    if (!row) {
      row = {
        city: label,
        county: null,
        patients: 0,
        latSum: 0,
        lonSum: 0,
        coordCount: 0,
        sampleQuery: formatGeocodeQuery(addr),
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

  return {
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
  };
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
