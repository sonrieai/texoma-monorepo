/**
 * Once-daily Open Dental dashboard snapshot (America/Chicago morning job).
 * SELECT-only. Writes data/od-dashboard-snapshot.json for page loads.
 *
 *   npm run snapshot:refresh
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import {
  getOpenDentalSnapshotPath,
  persistOpenDentalSnapshot,
} from "../src/lib/opendental/snapshot";
import { closeOpenDentalMysql } from "../src/lib/opendental/mysql";

loadEnvLocal();

async function main() {
  const snapshot = await persistOpenDentalSnapshot();
  console.log(
    JSON.stringify(
      {
        loadedAt: snapshot.loadedAt,
        path: getOpenDentalSnapshotPath(),
        appointments: snapshot.appointments.length,
        procedures: snapshot.procedures.length,
        patients: snapshot.patients.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
