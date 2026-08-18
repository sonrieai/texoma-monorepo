/**
 * Smoke: warehouse Mongo counts. Usage: npx tsx scripts/smoke-warehouse.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const { getDb, closeMongoClient } = await import("../src/lib/mongo/client");
  const { loadWarehouseOverview } = await import(
    "../src/lib/mongo/warehouse-overview"
  );
  const db = await getDb();
  const cols = await db.listCollections().toArray();
  const counts: Record<string, number> = {};
  for (const c of cols) {
    counts[c.name] = await db.collection(c.name).countDocuments();
  }
  const overview = await loadWarehouseOverview();
  console.log(
    JSON.stringify(
      {
        db: db.databaseName,
        collections: counts,
        source: overview.source,
        empty: overview.warehouseEmpty,
        lastSyncedAt: overview.lastSyncedAt,
        location: overview.locationName,
        appointments: overview.appointments.total,
        providers: overview.providers.length,
        grossCents: overview.production.grossProductionCents,
        vol: overview.production.procedureVolume,
        sameDay: overview.conversion.sameDayStarts,
        arCents: overview.accountsReceivable.totalArCents,
      },
      null,
      2,
    ),
  );
  await closeMongoClient();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
