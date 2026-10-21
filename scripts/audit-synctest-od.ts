/**
 * Read-only audit for SYNCTEST_* rows left in Open Dental (Change Spec item 2).
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { closeOpenDentalMysql, queryOpenDental } from "../src/lib/opendental/mysql";
import type { RowDataPacket } from "mysql2";

loadEnvLocal();

async function countLike(
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const rows = await queryOpenDental<RowDataPacket>(sql, params);
  const n = rows[0]?.cnt;
  return Number(n) || 0;
}

async function main() {
  const patient = await countLike(
    `SELECT COUNT(*) AS cnt FROM patient WHERE LName LIKE 'SYNCTEST%' OR FName LIKE 'SYNCTEST%'`,
  );
  const appointment = await countLike(
    `SELECT COUNT(*) AS cnt FROM appointment a
     INNER JOIN patient p ON p.PatNum = a.PatNum
     WHERE p.LName LIKE 'SYNCTEST%' OR p.FName LIKE 'SYNCTEST%'`,
  );
  const procedurelog = await countLike(
    `SELECT COUNT(*) AS cnt FROM procedurelog pl
     INNER JOIN patient p ON p.PatNum = pl.PatNum
     WHERE p.LName LIKE 'SYNCTEST%' OR p.FName LIKE 'SYNCTEST%'`,
  );
  const apptType = await countLike(
    `SELECT COUNT(*) AS cnt FROM appointmenttype WHERE AppointmentTypeName LIKE 'SYNCTEST%'`,
  );
  const definition = await countLike(
    `SELECT COUNT(*) AS cnt FROM definition WHERE ItemName LIKE 'SYNCTEST%'`,
  );

  console.log("SYNCTEST audit (SELECT only)");
  console.log(`  patient rows:      ${patient}`);
  console.log(`  appointment rows:  ${appointment}`);
  console.log(`  procedurelog rows: ${procedurelog}`);
  console.log(`  appointmenttype:   ${apptType}`);
  console.log(`  definition:        ${definition}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
