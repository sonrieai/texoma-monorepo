/**
 * End-to-end audit for Patients by Area (/geo).
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
} from "../src/lib/nexhealth/patient-address";
import { mapPatientDirectoryRows } from "../src/lib/nexhealth/patients";
import { centsToDollars } from "../src/lib/metrics";
import type { ChargeDoc, PatientDoc } from "../src/lib/mongo/types";
import type { NexPatient } from "../src/lib/nexhealth/client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

async function loadPatientRaws(): Promise<NexPatient[]> {
  const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
  if (!locationId) return [];
  const docs = await getCollection<PatientDoc>(COLLECTIONS.patients).then((c) =>
    c.find({ locationId }).toArray(),
  );
  return docs.map((d) => d.raw);
}

async function main() {
  const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
  const raw = await loadPatientRaws();
  const rows = mapPatientDirectoryRows(raw);
  const active = rows.filter((p) => !p.inactive);
  const withAddress = active.filter((p) => hasGeocodableAddress(p));

  const byCity = new Map<
    string,
    { city: string; county: string | null; patients: number; productionCents: number }
  >();

  for (const p of withAddress) {
    const label = cityLabel(p);
    if (!label) continue;
    let row = byCity.get(label);
    if (!row) {
      row = { city: label, county: p.county, patients: 0, productionCents: 0 };
      byCity.set(label, row);
    }
    row.patients += 1;
    if (!row.county && p.county) row.county = p.county;
  }

  let productionByCity = new Map<string, number>();
  if (locationId) {
    const chargeDocs = await getCollection<ChargeDoc>(COLLECTIONS.charges).then((c) =>
      c.find({ locationId }).toArray(),
    );
    productionByCity = aggregateProductionCentsByCity(
      withAddress,
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
  const trackedProductionRows = cities.reduce((s, r) => s + r.production, 0);
  const countiesReached = new Set(
    cities.map((c) => c.county).filter(Boolean),
  ).size;

  console.log("=== GEO PAGE AUDIT (sandbox warehouse) ===\n");
  console.log("--- Patient counts ---");
  console.log("Total in warehouse:", raw.length);
  console.log("Active:", active.length);
  console.log("With geocodable address:", withAddress.length);
  console.log("Without address (excluded):", active.length - withAddress.length);
  console.log();

  console.log("--- KPI cards ---");
  const top = cities[0];
  console.log("Top area by production:", top?.city.split(",")[0] ?? "—");
  console.log("  $ note:", top?.production ?? 0);
  console.log("Patients (tracked):", trackedPatients, `across ${cities.length} cities`);
  console.log("Production (tracked):", centsToDollars(totalProductionCents));
  console.log("Counties reached:", countiesReached, `of ${TEXOMA_REGION_COUNTY_COUNT}`);
  console.log();

  console.log("--- Consistency ---");
  console.log("Sum city patients === withAddress?", trackedPatients === withAddress.length);
  console.log(
    "Sum city $ === totalProductionCents?",
    Math.abs(trackedProductionRows - centsToDollars(totalProductionCents)) < 1,
  );
  console.log();

  if (locationId) {
    const charges = await getCollection<ChargeDoc>(COLLECTIONS.charges).then((c) =>
      c.find({ locationId }).toArray(),
    );
    const positive = charges.filter(
      (d) =>
        !d.raw.deleted_at &&
        d.raw.patient_id != null &&
        Number.parseFloat(String(d.raw.fee?.amount ?? "0")) > 0,
    );
    const mappedPatientIds = new Set(withAddress.map((p) => p.nexId));
    const unmapped = positive.filter(
      (d) => !mappedPatientIds.has(d.raw.patient_id!),
    );
    console.log("--- Charge coverage ---");
    console.log("Positive charges total:", positive.length);
    console.log("Charges from patients without address/city:", unmapped.length);
    console.log("Period filter: NONE (all-time charges in Mongo)");
    console.log();
  }

  console.log("--- Cities (all) ---");
  for (const row of cities) {
    console.log(
      `${row.city.padEnd(24)} | ${(row.county ?? "—").padEnd(14)} | ${String(row.patients).padStart(2)} pts | $${row.production}`,
    );
  }

  console.log("\n--- Prototype gaps ---");
  console.log("- Daily / Monthly / Date range: not wired on /geo");
  console.log("- Campaign flags on map: not implemented (no GHL/marketing source in pipeline)");
  console.log("- Prototype sample data (Sherman, Denison…): not this sandbox");
  console.log("- County: from patient record or geocoder; often blank until geocode runs");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
