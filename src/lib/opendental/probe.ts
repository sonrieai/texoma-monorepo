/**
 * PHI-safe Open Dental MySQL probe — connectivity, grants, table presence, counts.
 * Never returns patient names, DOB, addresses, or other identifiers.
 */

import type { RowDataPacket } from "mysql2";
import {
  getOpenDentalMysqlConfig,
  isOpenDentalMysqlConfigured,
  type OpenDentalMysqlConfig,
} from "@/lib/opendental/config";
import { queryOpenDental } from "@/lib/opendental/mysql";

/** Tables required for warehouse ingest (Phase A–C). */
export const REQUIRED_OD_TABLES = [
  "provider",
  "appointment",
  "appointmenttype",
  "patient",
  "procedurelog",
  "procedurecode",
  "definition",
  "payment",
  "paysplit",
  "adjustment",
  "treatplan",
  "proctp",
  "claim",
  "insplan",
  "carrier",
  "patplan",
  "inssub",
] as const;

export type OdTableCount = {
  table: string;
  present: boolean;
  rowCount: number | null;
};

export type OdMysqlProbeResult = {
  ok: boolean;
  configured: boolean;
  config: Omit<OpenDentalMysqlConfig, "password"> | null;
  connected: boolean;
  serverVersion: string | null;
  database: string | null;
  grantsReadonly: boolean | null;
  grantSummary: string[];
  tables: OdTableCount[];
  missingTables: string[];
  errors: string[];
};

function redactConfig(
  config: OpenDentalMysqlConfig,
): Omit<OpenDentalMysqlConfig, "password"> {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
  };
}

async function listPresentTables(
  database: string,
): Promise<Set<string>> {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT TABLE_NAME AS name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
       AND TABLE_TYPE = 'BASE TABLE'`,
    [database],
  );
  return new Set(
    rows
      .map((r) => String(r.name ?? "").toLowerCase())
      .filter(Boolean),
  );
}

async function safeCount(table: string): Promise<number | null> {
  try {
    const rows = await queryOpenDental<RowDataPacket>(
      `SELECT COUNT(*) AS c FROM \`${table}\``,
    );
    const c = rows[0]?.c;
    return typeof c === "number" ? c : Number(c) || 0;
  } catch {
    return null;
  }
}

/**
 * Heuristic: SELECT-only if grants mention SELECT and do not mention
 * INSERT/UPDATE/DELETE/DROP/ALTER (except routine metadata).
 */
function analyzeGrants(grantLines: string[]): {
  readonly: boolean | null;
  summary: string[];
} {
  if (grantLines.length === 0) return { readonly: null, summary: [] };
  const joined = grantLines.join("\n").toUpperCase();
  const hasSelect = /\bSELECT\b/.test(joined) || /\bALL PRIVILEGES\b/.test(joined);
  const hasWrite =
    /\bINSERT\b/.test(joined) ||
    /\bUPDATE\b/.test(joined) ||
    /\bDELETE\b/.test(joined) ||
    /\bDROP\b/.test(joined) ||
    /\bALTER\b/.test(joined) ||
    /\bALL PRIVILEGES\b/.test(joined);
  const summary = grantLines.map((line) =>
    line.replace(/IDENTIFIED BY[^,]*/gi, "IDENTIFIED BY ***"),
  );
  if (!hasSelect) return { readonly: false, summary };
  return { readonly: !hasWrite, summary };
}

export async function probeOpenDentalMysql(): Promise<OdMysqlProbeResult> {
  const errors: string[] = [];
  if (!isOpenDentalMysqlConfigured()) {
    return {
      ok: false,
      configured: false,
      config: null,
      connected: false,
      serverVersion: null,
      database: null,
      grantsReadonly: null,
      grantSummary: [],
      tables: [],
      missingTables: [...REQUIRED_OD_TABLES],
      errors: [
        "Open Dental MySQL is not configured. Set OD_MYSQL_HOST, OD_MYSQL_USER, OD_MYSQL_DB, OD_MYSQL_PASS.",
      ],
    };
  }

  const config = getOpenDentalMysqlConfig()!;
  const redacted = redactConfig(config);

  let connected = false;
  let serverVersion: string | null = null;
  let database: string | null = config.database;
  let grantsReadonly: boolean | null = null;
  let grantSummary: string[] = [];
  const tables: OdTableCount[] = [];
  let missingTables: string[] = [];

  try {
    const verRows = await queryOpenDental<RowDataPacket>(
      "SELECT VERSION() AS v, DATABASE() AS db",
    );
    connected = true;
    serverVersion = String(verRows[0]?.v ?? "") || null;
    if (verRows[0]?.db) database = String(verRows[0].db);
  } catch (e) {
    errors.push(
      `connect: ${e instanceof Error ? e.message : "connection failed"}`,
    );
    return {
      ok: false,
      configured: true,
      config: redacted,
      connected: false,
      serverVersion: null,
      database: config.database,
      grantsReadonly: null,
      grantSummary: [],
      tables: [],
      missingTables: [...REQUIRED_OD_TABLES],
      errors,
    };
  }

  try {
    const grantRows = await queryOpenDental<RowDataPacket>("SHOW GRANTS");
    const lines = grantRows.map((r) => String(Object.values(r)[0] ?? ""));
    const analyzed = analyzeGrants(lines);
    grantsReadonly = analyzed.readonly;
    grantSummary = analyzed.summary;
    if (grantsReadonly === false) {
      errors.push(
        "MySQL user appears to have write privileges — use a SELECT-only account for production.",
      );
    }
  } catch (e) {
    errors.push(
      `grants: ${e instanceof Error ? e.message : "SHOW GRANTS failed"}`,
    );
  }

  try {
    const present = await listPresentTables(database!);
    missingTables = REQUIRED_OD_TABLES.filter((t) => !present.has(t));
    for (const table of REQUIRED_OD_TABLES) {
      const isPresent = present.has(table);
      tables.push({
        table,
        present: isPresent,
        rowCount: isPresent ? await safeCount(table) : null,
      });
    }
    if (missingTables.length) {
      errors.push(`missing tables: ${missingTables.join(", ")}`);
    }
  } catch (e) {
    errors.push(
      `schema: ${e instanceof Error ? e.message : "schema inspection failed"}`,
    );
    missingTables = [...REQUIRED_OD_TABLES];
  }

  const missingOk = missingTables.length === 0;
  const connectOk = connected && !errors.some((e) => e.startsWith("connect:"));

  return {
    ok: connectOk && missingOk,
    configured: true,
    config: redacted,
    connected,
    serverVersion,
    database,
    grantsReadonly,
    grantSummary,
    tables,
    missingTables,
    errors,
  };
}
