/**
 * Office-LAN poll: Open Dental patients → Texoma GoHighLevel
 * (contact → appointment → Active Sequence).
 *
 * Usage:
 *   npm run sync:od-ghl -- --mode=consults
 *   npm run sync:od-ghl -- --mode=patients --dry-run
 *
 * Modes:
 *   consults      every 5 minutes (consult appointments only)
 *   patients      03:00 America/Chicago
 *   appointments  04:00 America/Chicago (non-consult)
 *   sold          05:00 America/Chicago
 *   all           e2e / one-shot only
 *
 * Locked to GHL_LOCATION_ID=m7Fk4S7LR8eTebuM3QPh (Texoma).
 * The first run of a mode only stores that cursor and does not backfill.
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { runOdGhlSync } from "../src/lib/ghl/sync-from-opendental";
import { parseOdGhlSyncMode } from "../src/lib/ghl/od-ghl-sync-state";
import { closeOpenDentalMysql } from "../src/lib/opendental/mysql";

loadEnvLocal();

const dryRun =
  process.argv.includes("--dry-run") ||
  process.env.GHL_OD_SYNC_DRY_RUN?.trim() === "1";

function argValue(flag: string): string | null {
  const prefix = `${flag}=`;
  const eq = process.argv.find((arg) => arg.startsWith(prefix));
  if (eq) return eq.slice(prefix.length);
  const index = process.argv.indexOf(flag);
  if (index >= 0) {
    const next = process.argv[index + 1];
    if (next && !next.startsWith("-")) return next;
  }
  return null;
}

const parsedMode = parseOdGhlSyncMode(argValue("--mode") ?? "consults");
if (!parsedMode) {
  console.error(
    "Unknown --mode. Use consults, patients, appointments, sold, or all.",
  );
  process.exit(1);
}

async function main() {
  const result = await runOdGhlSync({ dryRun, mode: parsedMode });
  if (result.initializedCursor) {
    console.log(
      dryRun
        ? `Open Dental → GoHighLevel (dry-run, ${result.mode}): no cursor yet; a live run would set it without backfill.`
        : `Open Dental → GoHighLevel ${result.mode} cursor set. The next run syncs changes after this time.`,
    );
    return;
  }
  console.log(
    [
      dryRun
        ? `Open Dental → GoHighLevel DRY-RUN ${result.mode}`
        : `Open Dental → GoHighLevel ${result.mode}`,
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
