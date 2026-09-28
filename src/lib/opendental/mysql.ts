import "server-only";

import mysql, { type ExecuteValues, type Pool } from "mysql2/promise";
import {
  getOpenDentalMysqlConfig,
  requireOpenDentalMysqlConfig,
} from "@/lib/opendental/config";

const POOL_SIZE = 8;
const CONNECT_TIMEOUT_MS = 15_000;

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const config = requireOpenDentalMysqlConfig();
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: POOL_SIZE,
    connectTimeout: CONNECT_TIMEOUT_MS,
    timezone: "Z",
  });
  return pool;
}

export async function queryOpenDental<T extends mysql.RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getPool().execute<T[]>(sql, params as ExecuteValues);
  return rows;
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
