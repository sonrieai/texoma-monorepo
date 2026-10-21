/**
 * Item 25 — compare ProcFee vs ProcFee*(UnitQty+BaseUnits) for a closed month (SELECT only).
 * Usage: npx tsx --env-file=.env.local --require ./scripts/register-server-only-stub.cjs scripts/compare-production-units.ts -- --month 2025-09
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { closeOpenDentalMysql, queryOpenDental } from "../src/lib/opendental/mysql";
import { OdProcStatus } from "../src/lib/opendental/types";
import type { RowDataPacket } from "mysql2";

loadEnvLocal();

function parseMonth(): { start: string; end: string } {
  const arg = process.argv.find((a) => a.startsWith("--month="));
  const month = arg?.slice("--month=".length) ?? process.argv[process.argv.indexOf("--month") + 1];
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Pass --month YYYY-MM");
  }
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0));
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endYmd = end.toISOString().slice(0, 10);
  return { start, end: endYmd };
}

async function main() {
  const { start, end } = parseMonth();
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT
       SUM(ROUND(pl.ProcFee * 100, 0)) AS feeOnlyCents,
       SUM(ROUND(pl.ProcFee * (pl.UnitQty + pl.BaseUnits) * 100, 0)) AS withUnitsCents,
       SUM(CASE WHEN pl.UnitQty + pl.BaseUnits <> 1 THEN 1 ELSE 0 END) AS multiUnitRows
     FROM procedurelog pl
     WHERE pl.ProcDate >= ? AND pl.ProcDate <= ?
       AND pl.ProcStatus = ?
       AND pl.ProcFee > 0`,
    [start, end, OdProcStatus.Complete],
  );
  const r = rows[0] ?? {};
  console.log(`Production comparison ${start} → ${end}`);
  console.log(`  ProcFee only (cents):     ${r.feeOnlyCents ?? 0}`);
  console.log(`  ProcFee * units (cents):  ${r.withUnitsCents ?? 0}`);
  console.log(`  Rows with units != 1:     ${r.multiUnitRows ?? 0}`);
  console.log("Compare both totals with Open Dental Production & Income before changing code.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
