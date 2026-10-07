import "server-only";

import type { RowDataPacket } from "mysql2";
import { getOpenDentalMysqlConfig } from "@/lib/opendental/config";
import { queryOpenDental } from "@/lib/opendental/mysql";

const columnCache = new Map<string, Set<string>>();

/** Cached column names for an Open Dental table (handles older restored backups). */
export async function odTableColumns(table: string): Promise<Set<string>> {
  const db = getOpenDentalMysqlConfig()?.database ?? "";
  const key = `${db}:${table}`;
  const hit = columnCache.get(key);
  if (hit) return hit;

  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table],
  );
  const set = new Set(
    rows.map((r) => String(r.name ?? "")).filter(Boolean),
  );
  columnCache.set(key, set);
  return set;
}

export async function odHasColumn(
  table: string,
  column: string,
): Promise<boolean> {
  return (await odTableColumns(table)).has(column);
}

/** First matching column name, or null if none exist. */
export async function odPickColumn(
  table: string,
  ...candidates: string[]
): Promise<string | null> {
  const cols = await odTableColumns(table);
  for (const name of candidates) {
    if (cols.has(name)) return name;
  }
  return null;
}
