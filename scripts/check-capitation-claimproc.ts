/**
 * Item 27 / Q4 — read-only counts for claimproc Status 5 and 7 (capitation).
 *
 *   npm run check:capitation
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { closeOpenDentalMysql, queryOpenDental } from "../src/lib/opendental/mysql";
import type { RowDataPacket } from "mysql2";

loadEnvLocal();

async function main() {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT cp.Status, COUNT(*) AS cnt
     FROM claimproc cp
     WHERE cp.Status IN (1, 4, 5, 7)
     GROUP BY cp.Status
     ORDER BY cp.Status`,
  );
  console.log("claimproc status counts (1,4,5,7):");
  for (const row of rows) {
    console.log(`  status ${row.Status}: ${row.cnt}`);
  }
  console.log(
    "\nDashboard receipts use Status IN (1,4). Extend only after Dr confirms capitation rows should count as collected.",
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
