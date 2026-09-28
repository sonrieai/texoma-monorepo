/**
 * PHI-safe Open Dental validate — probe + snapshot sanity counts.
 * Never prints patient names, DOB, addresses, or other identifiers.
 *
 * Usage:
 *   npm run validate:opendental
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { probeOpenDentalMysql } from "../src/lib/opendental/probe";
import { loadOpenDentalSnapshot } from "../src/lib/opendental/snapshot";
import {
  createCdtLookupFromDocs,
  emptyCdtLookup,
} from "../src/lib/cdt/categories";
import { summarizeProductionFromLedger } from "../src/lib/warehouse/production";

loadEnvLocal();

function currentMonthYmdRange(now = new Date()): { fromYmd: string; toYmd: string } {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return {
    fromYmd: `${year}-${month}-01`,
    toYmd: `${year}-${month}-${day}`,
  };
}

async function main() {
  console.log("Open Dental validate (PHI-safe)");
  console.log("");

  const probe = await probeOpenDentalMysql();
  console.log("Probe");
  console.log(
    `  configured: ${probe.configured}  connected: ${probe.connected}  ok: ${probe.ok}`,
  );
  if (probe.config) {
    console.log(
      `  host: ${probe.config.host}:${probe.config.port}  db: ${probe.config.database}  user: ${probe.config.user}`,
    );
  }
  if (probe.grantsReadonly != null) {
    console.log(
      `  grants: ${probe.grantsReadonly ? "SELECT-only (heuristic)" : "MAY INCLUDE WRITE PRIVILEGES"}`,
    );
  }
  if (probe.missingTables.length) {
    console.log(`  missing tables: ${probe.missingTables.join(", ")}`);
  }
  for (const e of probe.errors) {
    console.log(`  - ${e}`);
  }

  if (!probe.ok) {
    console.log("");
    console.log("Validate aborted — fix probe errors first.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Snapshot sanity (no PHI)");
  const snap = await loadOpenDentalSnapshot();
  const { fromYmd, toYmd } = currentMonthYmdRange();
  const cdt =
    snap.cdtRows.length > 0
      ? createCdtLookupFromDocs(snap.cdtRows)
      : emptyCdtLookup;

  const production = summarizeProductionFromLedger({
    fromYmd,
    toYmd,
    procedures: snap.procedures,
    charges: snap.charges,
    payments: snap.payments,
    adjustments: snap.adjustments,
    patients: snap.patients,
    cdt,
    adjustmentTypes: snap.adjustmentTypes,
  });

  console.log(`  loadedAt: ${snap.loadedAt}`);
  console.log(`  providers: ${snap.providers.length}`);
  console.log(`  procedures (window): ${snap.procedures.length}`);
  console.log(`  appointments (window): ${snap.appointments.length}`);
  console.log(`  patients (slim index): ${snap.patients.length}`);
  console.log(
    `  current-month gross production cents (${fromYmd}..${toYmd}): ${production.grossProductionCents}`,
  );
  console.log(
    `  current-month adjusted production cents: ${production.netProductionCents}`,
  );
  console.log("");
  console.log(
    "Compare Overview totals to Open Dental Production / A/R reports before go-live.",
  );
  if (probe.grantsReadonly === false) {
    console.log(
      "WARNING: MySQL user is not SELECT-only — required for office production.",
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
