/**
 * Set the OD→GHL cursor to Open Dental NOW() without backfilling.
 * Keeps existing PatNum ↔ contact links. Texoma go-live cutover.
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import {
  readOdGhlSyncState,
  writeOdGhlSyncState,
} from "../src/lib/ghl/od-ghl-sync-state";
import { odDatabaseNow } from "../src/lib/opendental/ghl-sync-queries";
import { closeOpenDentalMysql } from "../src/lib/opendental/mysql";

loadEnvLocal();

async function main() {
  const state = await readOdGhlSyncState();
  const previous = { cursor: state.cursor, cursors: { ...state.cursors } };
  const now = await odDatabaseNow();
  state.cursors = {
    consults: now,
    patients: now,
    appointments: now,
    sold: now,
  };
  state.cursor = now;
  await writeOdGhlSyncState(state);
  console.log(
    JSON.stringify(
      {
        previousCursors: previous,
        newCursors: state.cursors,
        linkedContacts: Object.keys(state.contacts).length,
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
