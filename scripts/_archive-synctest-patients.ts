import { loadEnvLocal } from "../src/lib/env/load-env-local";
import {
  closeOpenDentalMysql,
  executeOpenDental,
  queryOpenDental,
} from "../src/lib/opendental/mysql";
import { odDatabaseNow } from "../src/lib/opendental/ghl-sync-queries";
import {
  readOdGhlSyncState,
  writeOdGhlSyncState,
} from "../src/lib/ghl/od-ghl-sync-state";
import type { RowDataPacket } from "mysql2";

loadEnvLocal();

async function main() {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT PatNum FROM patient WHERE LName = 'SyncTest' OR ChartNumber LIKE 'SYNCTEST-%'`,
  );
  for (const row of rows) {
    await executeOpenDental(`UPDATE patient SET PatStatus = 2 WHERE PatNum = ?`, [
      Number(row.PatNum),
    ]);
  }
  await executeOpenDental(
    `DELETE FROM appointment WHERE Note LIKE 'SYNCTEST e2e %'`,
  ).catch(() => undefined);

  const state = await readOdGhlSyncState();
  state.cursor = await odDatabaseNow();
  // Drop SyncTest contact links so retries don't poison the next sync
  for (const row of rows) {
    delete state.contacts[String(row.PatNum)];
  }
  await writeOdGhlSyncState(state);
  console.log(
    JSON.stringify(
      {
        archivedPatients: rows.length,
        newCursor: state.cursor,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeOpenDentalMysql());
