/**
 * CLI: sync NexHealth → MongoDB warehouse.
 * Usage: npm run sync:nexhealth
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadEnvLocal,
  runNexHealthWarehouseSync,
} from "../src/lib/mongo/sync";
import { closeMongoClient } from "../src/lib/mongo/client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

if (process.argv.includes("--full")) {
  process.env.SYNC_NEXHEALTH_FULL = "1";
}

async function main() {
  console.log("Starting NexHealth → MongoDB warehouse sync…");
  try {
    const result = await runNexHealthWarehouseSync();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      console.error("Sync completed with errors.");
      process.exitCode = 1;
    } else {
      console.log(
        `OK · ${result.nexhealthRequestCount} NexHealth request batches · synced ${result.lastSyncedAt}`,
      );
      if (result.suggestedNpConsultTypeIds?.length) {
        console.log(
          `Tip: set NEXHEALTH_NP_CONSULT_TYPE_IDS=${result.suggestedNpConsultTypeIds.join(",")} in .env.local for consult KPIs.`,
        );
      }
    }
  } finally {
    await closeMongoClient();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
