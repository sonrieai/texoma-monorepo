/**
 * PHI-safe geographic aggregates — city-level counts from synced patient addresses.
 * Map coordinates geocoded from real OD address fields (Census / Nominatim).
 */

import { geocodeAddressQueries, normalizeGeocodeKey } from "@/lib/geo/geocode";
import { COLLECTIONS, getCollection, isMongoConfigured } from "@/lib/mongo/client";
import type { ChargeDoc } from "@/lib/mongo/types";
import { loadWarehousePatientRaws } from "@/lib/mongo/warehouse-patients";
import type { NexPatient } from "@/lib/nexhealth/client";
import {
  aggregateProductionCentsByCity,
  TEXOMA_REGION_COUNTY_COUNT,
} from "@/lib/nexhealth/geo-production";
import {
  cityLabel,
  formatGeocodeQuery,
  hasGeocodableAddress,
  indexPatientsByNexId,
  resolvePatientAddress,
} from "@/lib/nexhealth/patient-address";
import {
  mapPatientDirectoryRows,
  type PatientDirectoryRow,
} from "@/lib/nexhealth/patients";
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

export async function loadGeoSummary(): Promise<GeoSummary> {
  const notices: string[] = [];
  let patients: PatientDirectoryRow[] = [];

  try {
    const raw = await loadWarehousePatientRaws();
    patients = mapPatientDirectoryRows(raw).filter((p) => !p.inactive);
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
        e instanceof Error
          ? e.message
          : "Patient warehouse unavailable.",
      ],
    };
  }

  if (patients.length === 0) {
    notices.push(
      "No patients in warehouse — run npm run sync:nexhealth after setting MONGODB_URI.",
    );
  }

  const withAddress = patients.filter((p) => hasGeocodableAddress(p));

  if (withAddress.length === 0) {
    notices.push(
      "No patient address fields in sync. Family records should include street, city, state, and ZIP.",
    );
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
  if (isMongoConfigured()) {
    const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
    if (locationId) {
      try {
        const chargeDocs = await getCollection<ChargeDoc>(COLLECTIONS.charges).then(
          (c) => c.find({ locationId }).toArray(),
        );
        productionByCity = aggregateProductionCentsByCity(
          withAddress,
          chargeDocs.map((d) => d.raw),
        );
      } catch {
        notices.push("Charge warehouse unavailable — production by city shows $0.");
      }
    }
  }

  const byCity = new Map<string, CityAgg>();
  const queriesToGeocode: string[] = [];
  let patientsWithSyncCoords = 0;

  for (const p of withAddress) {
    const label = cityLabel(p);
    if (!label) continue;

    let row = byCity.get(label);
    if (!row) {
      row = {
        city: label,
        county: p.county,
        patients: 0,
        latSum: 0,
        lonSum: 0,
        coordCount: 0,
        sampleQuery: formatGeocodeQuery(p),
      };
      byCity.set(label, row);
    }

    row.patients += 1;
    if (!row.county && p.county) row.county = p.county;
    if (!row.sampleQuery) row.sampleQuery = formatGeocodeQuery(p);

    if (p.latitude != null && p.longitude != null) {
      row.latSum += p.latitude;
      row.lonSum += p.longitude;
      row.coordCount += 1;
      patientsWithSyncCoords += 1;
    }
  }

  for (const row of [...byCity.values()].sort((a, b) => b.patients - a.patients)) {
    if (row.coordCount === 0 && row.sampleQuery) {
      queriesToGeocode.push(row.sampleQuery);
    }
  }

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
    if (!row.county && hit.county) row.county = hit.county;
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
    if (p.latitude != null && p.longitude != null) return true;
    const label = cityLabel(p);
    if (!label) return false;
    const row = byCity.get(label);
    return row != null && row.coordCount > 0;
  }).length;

  notices.push(
    `${withAddress.length} patients with address · ${mapCities.length} cities on map (${patientsWithSyncCoords} synced coords, ${geocodeHits} cities geocoded from OD address).`,
  );
  if (withAddress.length > 0 && mapCities.length === 0) {
    notices.push(
      "Address fields present but geocoding returned no matches — verify city/state/ZIP.",
    );
  }
  if (queriesToGeocode.length > geocodeHits && geocodeHits < queriesToGeocode.length) {
    notices.push(
      `Geocoded ${geocodeHits} of ${queriesToGeocode.length} unique address(es) this load (cap ${60}/request). Refresh to resolve remaining cities.`,
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

/** Used by debug tooling to inspect raw address field coverage. */
export function summarizePatientAddressFields(
  patients: NexPatient[],
): { total: number; withStreet: number; withCity: number; withState: number; withZip: number } {
  let withStreet = 0;
  let withCity = 0;
  let withState = 0;
  let withZip = 0;
  for (const p of patients) {
    const a = resolvePatientAddress(p, indexPatientsByNexId(patients));
    if (a.addressLine) withStreet += 1;
    if (a.city) withCity += 1;
    if (a.state) withState += 1;
    if (a.postalCode) withZip += 1;
  }
  return { total: patients.length, withStreet, withCity, withState, withZip };
}
