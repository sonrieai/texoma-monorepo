/**
 * Office-LAN poll: Open Dental patients → Texoma GoHighLevel
 * (contact → appointment → Active Sequence).
 *
 * Usage:
 *   npm run sync:od-ghl
 *   npm run sync:od-ghl -- --dry-run
 *
 * Locked to GHL_LOCATION_ID=m7Fk4S7LR8eTebuM3QPh (Texoma).
 * The first run only stores a cursor and does not backfill old patients.
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { runOdGhlSync } from "../src/lib/ghl/sync-from-opendental";
import { closeOpenDentalMysql } from "../src/lib/opendental/mysql";

loadEnvLocal();

const dryRun =
  process.argv.includes("--dry-run") ||
  process.env.GHL_OD_SYNC_DRY_RUN?.trim() === "1";

async function main() {
  const result = await runOdGhlSync({ dryRun });
  if (result.initializedCursor) {
    console.log(
      dryRun
        ? "Open Dental → GoHighLevel (dry-run): no cursor yet; a live run would set it without backfill."
        : "Open Dental → GoHighLevel cursor set. The next run syncs changes after this time.",
    );
    return;
  }
  console.log(
    [
      dryRun ? "Open Dental → GoHighLevel DRY-RUN" : "Open Dental → GoHighLevel",
      `patients ${result.patients}`,
      `futureAppt ${result.withFutureAppt}`,
      `nurture ${result.nurtureEligible}`,
      ...(dryRun
        ? [
            `wouldCreate ${result.wouldCreateContacts ?? 0}`,
            `wouldMatch ${result.wouldMatchExisting ?? 0}`,
            `unclear ${result.wouldSkipUnclear ?? 0}`,
          ]
        : [
            `upserted ${result.upserted}`,
            `appts ${result.appointmentsWritten}`,
            `tagged ${result.tagged}`,
            `cleared ${result.cleared}`,
            `unchanged ${result.unchanged}`,
            `skipped ${result.skippedNoContact}`,
            `failed ${result.failed}`,
          ]),
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
