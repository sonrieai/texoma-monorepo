/**
 * Office-LAN poll: new Open Dental patients and no-show tags → GoHighLevel.
 *
 * Usage:
 *   npm run sync:od-ghl
 *
 * The first run only stores a cursor and does not backfill old patients.
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { runOdGhlSync } from "../src/lib/ghl/sync-from-opendental";
import { closeOpenDentalMysql } from "../src/lib/opendental/mysql";

loadEnvLocal();

async function main() {
  const result = await runOdGhlSync();
  if (result.initializedCursor) {
    console.log(
      "Open Dental → GoHighLevel cursor set. The next run syncs changes after this time.",
    );
    return;
  }
  console.log(
    [
      "Open Dental → GoHighLevel",
      `patients ${result.patients}`,
      `upserted ${result.upserted}`,
      `tagged ${result.tagged}`,
      `cleared ${result.cleared}`,
      `unchanged ${result.unchanged}`,
      `skipped ${result.skippedNoContact}`,
      `failed ${result.failed}`,
    ].join("  "),
  );
  if (result.failed > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "sync failed";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
