/**
 * End-to-end audit for Patients by Area (/geo) using the de-identified index.
 * Usage: npx tsx scripts/diagnose-geo.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import { closeMongoClient, COLLECTIONS, getCollection } from "../src/lib/mongo/client";
import {
  aggregateProductionCentsByCity,
  TEXOMA_REGION_COUNTY_COUNT,
} from "../src/lib/nexhealth/geo-production";
import {
  cityLabel,
  hasGeocodableAddress,
  type PatientAddress,
} from "../src/lib/nexhealth/patient-address";
import { centsToDollars } from "../src/lib/metrics";
import type { ChargeDoc, PatientDoc } from "../src/lib/mongo/types";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

function toAddress(d: PatientDoc): PatientAddress {
  return {
    addressLine: null,
    city: d.geoCity,
    state: d.geoState,
    postalCode: d.geoZip,
    county: null,
    latitude: null,
    longitude: null,
  };
}

async function main() {
  const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
  const docs = locationId
    ? await getCollection<PatientDoc>(COLLECTIONS.patients).then((c) =>
        c.find({ locationId }).toArray(),
      )
    : [];
  const active = docs.filter((p) => !p.inactive);
  const withAddress = active.filter((p) => hasGeocodableAddress(toAddress(p)));

  const cityRows = withAddress.map((d) => ({
    patientId: d.patientId,
    city: d.geoCity,
    state: d.geoState,
    zip: d.geoZip,
  }));

  const byCity = new Map<
    string,
    { city: string; county: string | null; patients: number; productionCents: number }
  >();

  for (const p of withAddress) {
    const label = cityLabel(toAddress(p));
    if (!label) continue;
    let row = byCity.get(label);
    if (!row) {
      row = { city: label, county: null, patients: 0, productionCents: 0 };
      byCity.set(label, row);
    }
    row.patients += 1;
  }

  let productionByCity = new Map<string, number>();
  if (locationId) {
    const chargeDocs = await getCollection<ChargeDoc>(COLLECTIONS.charges).then(
      (c) => c.find({ locationId }).toArray(),
    );
    productionByCity = aggregateProductionCentsByCity(
      cityRows,
      chargeDocs.map((d) => d.raw),
    );
  }

  const cities = [...byCity.values()]
    .map((row) => ({
      ...row,
      production: Math.round((productionByCity.get(row.city) ?? 0) / 100),
    }))
    .sort((a, b) => b.production - a.production || b.patients - a.patients);

  const totalProductionCents = [...productionByCity.values()].reduce(
    (s, c) => s + c,
    0,
  );
  const trackedPatients = cities.reduce((s, r) => s + r.patients, 0);
  const countiesReached = new Set(
    cities.map((c) => c.county).filter(Boolean),
  ).size;

  console.log("=== GEO PAGE AUDIT (de-identified warehouse) ===\n");
  console.log("Total in warehouse:", docs.length);
  console.log("Active:", active.length);
  console.log("With city/state/ZIP:", withAddress.length);
  console.log("Top area:", cities[0]?.city ?? "—");
  console.log("Patients (tracked):", trackedPatients);
  console.log("Production (tracked):", centsToDollars(totalProductionCents));
  console.log("Counties reached:", countiesReached, `of ${TEXOMA_REGION_COUNTY_COUNT}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
