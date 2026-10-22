/**
 * Insert one clearly labeled TEST patient into Open Dental for OD→GHL sync checks.
 *
 * Usage:
 *   npx tsx --env-file=.env.local --require ./scripts/register-server-only-stub.cjs scripts/create-od-test-patient.ts
 *   npx tsx ... scripts/create-od-test-patient.ts -- --sync
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import {
  closeOpenDentalMysql,
  executeOpenDental,
  queryOpenDental,
} from "../src/lib/opendental/mysql";
import { runOdGhlSync } from "../src/lib/ghl/sync-from-opendental";
import type { RowDataPacket } from "mysql2";

loadEnvLocal();

const runSync = process.argv.includes("--sync");
const TEMPLATE_PATNUM = 14675;

async function main() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const chart = `SYNCTEST-${stamp}`;
  const email = `sync.test.${stamp}@example.com`;
  const phone = `580555${String(Date.now()).slice(-4)}`;
  const fname = `Patient${stamp.slice(-6)}`;
  const lname = "SyncTest";

  // Clone a real row (all columns), then overwrite identity fields.
  // PatNum is auto-increment — omit it from the SELECT list by rebuilding.
  const cols = await queryOpenDental<RowDataPacket>(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'patient'
       AND EXTRA NOT LIKE '%auto_increment%'
     ORDER BY ORDINAL_POSITION`,
  );
  const names = cols.map((c) => String(c.name));
  if (names.length === 0) throw new Error("Could not read patient columns");

  const selectList = names
    .map((name) => {
      if (name === "LName") return `? AS LName`;
      if (name === "FName") return `? AS FName`;
      if (name === "WirelessPhone") return `? AS WirelessPhone`;
      if (name === "HmPhone") return `'' AS HmPhone`;
      if (name === "Email") return `? AS Email`;
      if (name === "ChartNumber") return `? AS ChartNumber`;
      if (name === "Guarantor") return `0 AS Guarantor`;
      if (name === "ResponsParty") return `0 AS ResponsParty`;
      if (name === "SuperFamily") return `0 AS SuperFamily`;
      if (name === "AddrNote") return `NULL AS AddrNote`;
      if (name === "FamFinUrgNote") return `NULL AS FamFinUrgNote`;
      return `\`${name}\``;
    })
    .join(", ");

  await executeOpenDental(
    `INSERT INTO patient (${names.map((n) => `\`${n}\``).join(", ")})
     SELECT ${selectList}
     FROM patient
     WHERE PatNum = ?
     LIMIT 1`,
    [lname, fname, phone, email, chart, TEMPLATE_PATNUM],
  );

  const created = await queryOpenDental<RowDataPacket>(
    `SELECT PatNum, FName, LName, WirelessPhone, Email, ChartNumber,
            DATE_FORMAT(DateTStamp, '%Y-%m-%d %H:%i:%s') AS DateTStamp
     FROM patient
     WHERE ChartNumber = ?
     LIMIT 1`,
    [chart],
  );
  const row = created[0];
  if (!row) throw new Error("Insert appeared to fail (patient not found by ChartNumber)");
  const patNum = Number(row.PatNum);
  await executeOpenDental(
    `UPDATE patient SET Guarantor = ? WHERE PatNum = ?`,
    [patNum, patNum],
  );

  console.log(
    JSON.stringify(
      {
        patNum,
        name: `${row.FName} ${row.LName}`,
        phone: row.WirelessPhone,
        email: row.Email,
        chartNumber: row.ChartNumber,
        dateTStamp: row.DateTStamp,
      },
      null,
      2,
    ),
  );

  if (runSync) {
    const result = await runOdGhlSync({ mode: "all" });
    console.log(
      [
        "sync",
        `patients ${result.patients}`,
        `upserted ${result.upserted}`,
        `appts ${result.appointmentsWritten}`,
        `tagged ${result.tagged}`,
        `failed ${result.failed}`,
      ].join("  "),
    );
  } else {
    console.log("Run with --sync to push to Texoma GHL now, or wait for the 5-min task.");
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
