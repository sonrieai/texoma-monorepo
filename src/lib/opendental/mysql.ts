import "server-only";

import mysql from "mysql2/promise";
import {
  getOpenDentalMysqlConfig,
  requireOpenDentalMysqlConfig,
} from "@/lib/opendental/config";

export async function queryOpenDental<T extends mysql.RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const config = requireOpenDentalMysqlConfig();
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: 15_000,
  });

  try {
    const [rows] = await connection.execute<T[]>(sql, params);
    return rows;
  } finally {
    await connection.end();
  }
}

/** Lightweight connectivity check (no PHI). */
export async function pingOpenDentalMysql(): Promise<boolean> {
  if (!getOpenDentalMysqlConfig()) return false;
  try {
    await queryOpenDental<mysql.RowDataPacket>("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}
