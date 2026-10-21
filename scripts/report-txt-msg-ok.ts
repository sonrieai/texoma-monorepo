/**
 * Item 29 — TxtMsgOk distribution (SELECT only).
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { closeOpenDentalMysql, queryOpenDental } from "../src/lib/opendental/mysql";
import type { RowDataPacket } from "mysql2";

loadEnvLocal();

async function main() {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT TxtMsgOk, COUNT(*) AS cnt FROM patient GROUP BY TxtMsgOk ORDER BY TxtMsgOk`,
  );
  console.log("TxtMsgOk counts (0=Unknown, 1=Yes, 2=No):");
  for (const row of rows) {
    console.log(`  ${row.TxtMsgOk}: ${row.cnt}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
