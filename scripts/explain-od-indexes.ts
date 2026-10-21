/**
 * Item 1 — EXPLAIN hot Open Dental queries (SELECT only). No writes.
 *
 *   npm run explain:od-indexes
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { closeOpenDentalMysql, queryOpenDental } from "../src/lib/opendental/mysql";
import type { RowDataPacket } from "mysql2";

loadEnvLocal();

const STATEMENTS: { name: string; sql: string; params: unknown[] }[] = [
  {
    name: "dashboard_patients_union",
    sql: `EXPLAIN SELECT p.PatNum FROM patient p
      WHERE p.PatNum IN (
        SELECT a.PatNum FROM appointment a
        WHERE a.AptDateTime >= ? AND a.AptDateTime < DATE_ADD(?, INTERVAL 1 DAY)
        UNION
        SELECT pl.PatNum FROM procedurelog pl
        WHERE pl.ProcDate >= ? AND pl.ProcDate <= ? AND pl.ProcStatus = 2
      ) LIMIT 1`,
    params: ["2025-01-01 00:00:00", "2025-12-31", "2025-01-01", "2025-12-31"],
  },
  {
    name: "daily_production_group",
    sql: `EXPLAIN SELECT DATE_FORMAT(pl.ProcDate, '%Y-%m-%d') AS ymd,
            ROUND(SUM(pl.ProcFee) * 100) AS cents
          FROM procedurelog pl
          WHERE pl.ProcDate >= ? AND pl.ProcDate <= ? AND pl.ProcStatus = 2
          GROUP BY ymd`,
    params: ["2025-01-01", "2025-12-31"],
  },
  {
    name: "paysplit_collections_group",
    sql: `EXPLAIN SELECT DATE_FORMAT(ps.DatePay, '%Y-%m-%d') AS ymd,
            ROUND(SUM(ps.SplitAmt) * 100) AS cents
          FROM paysplit ps
          WHERE ps.DatePay >= ? AND ps.DatePay <= ?
          GROUP BY ymd`,
    params: ["2025-01-01", "2025-12-31"],
  },
];

async function main() {
  for (const stmt of STATEMENTS) {
    console.log(`\n=== ${stmt.name} ===`);
    const rows = await queryOpenDental<RowDataPacket>(stmt.sql, stmt.params);
    for (const row of rows) {
      console.log(
        [
          row.type,
          row.table,
          row.possible_keys,
          row.key,
          row.rows,
          row.Extra,
        ].join(" | "),
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
