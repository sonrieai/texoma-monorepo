/**
 * Verify By Provider table counts vs warehouse charges.
 * Usage: npx tsx scripts/diagnose-provider-table.ts [fromYmd] [toYmd]
 */
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import { createCdtLookupFromDocs } from "../src/lib/cdt/categories";
import { providerCockpitCategoryCounts } from "../src/lib/charts/cockpit-display-categories";
import { summarizeProductionFromLedger } from "../src/lib/nexhealth/production";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import type { CdtCodeDoc } from "../src/lib/mongo/types";

loadEnvLocal(resolve(process.cwd()));

const uri = process.env.MONGODB_URI ?? process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DB ?? "open-dental-backup";
const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
const fromYmd = process.argv[2] ?? "2026-01-01";
const toYmd = process.argv[3] ?? "2026-08-17";

function inRange(date: string | null | undefined): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= fromYmd && d <= toYmd;
}

async function main() {
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const providers = await db.collection("providers").find({ locationId }).toArray();
  const charges = await db.collection("charges").find({ locationId }).toArray();
  const procedures = await db.collection("procedures").find({ locationId }).toArray();
  const cdtDocs = (await db.collection("cdt_codes").find({}).toArray()) as CdtCodeDoc[];

  const cdt = createCdtLookupFromDocs(
    cdtDocs.map((d) => ({
      code: d.code,
      category: d.category,
      description: d.description,
      volumeBucket: d.volumeBucket,
      warrantyBucket: d.warrantyBucket,
      isAox: d.isAox,
      isSoldCase: d.isSoldCase,
      isConsult: d.isConsult,
    })),
  );

  const production = summarizeProductionFromLedger({
    fromYmd,
    toYmd,
    procedures: procedures.map((p) => p.raw),
    charges: charges.map((c) => c.raw),
    payments: [],
    adjustments: [],
    cdt,
  });

  const names = new Map(providers.map((p) => [p.nexhealthId, p.name]));

  console.log(`Period: ${fromYmd} → ${toYmd}\n`);

  for (const [pid, prod] of [...production.byProvider.entries()].sort(
    (a, b) => b[1].grossProductionCents - a[1].grossProductionCents,
  )) {
    const cats = providerCockpitCategoryCounts(
      prod.productionByCategory,
      prod.procedureVolume,
    );
    console.log(`=== ${names.get(pid) ?? pid} ===`);
    console.log(`  Production: $${(prod.grossProductionCents / 100).toFixed(0)}`);
    console.log(`  Table counts:`, cats);
    console.log(`  productionByCategory:`);
    for (const row of prod.productionByCategory) {
      console.log(
        `    ${row.category}: count=${row.count} prod=$${(row.productionCents / 100).toFixed(0)}`,
      );
    }
    console.log(`  procedureVolume:`, prod.procedureVolume);
    const chargeRows = charges
      .filter(
        (c) => inRange(c.raw.charged_at) && c.raw.provider_id === pid,
      )
      .map((c) => c.raw);
    console.log(`  Charges (${chargeRows.length}):`);
    for (const c of chargeRows) {
      const code = c.procedure_code ?? "?";
      console.log(
        `    ${code} $${c.fee?.amount ?? "?"} cat=${cdt.lookupCategory(code) ?? "?"} bucket=${cdt.volumeBucket(code) ?? "—"}`,
      );
    }
    console.log("");
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
