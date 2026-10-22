/**
 * Open Dental reads for the GoHighLevel contact sync.
 * Phone and email stay in memory for the API call. They are not written locally.
 */

import type { RowDataPacket } from "mysql2";
import {
  CONSULT_EXAM_PROCEDURE_CODES,
  SOLD_PROCEDURES,
} from "@/lib/ghl/od-disposition-tags";
import { queryOpenDental } from "@/lib/opendental/mysql";
import { odHasColumn } from "@/lib/opendental/schema-columns";
import {
  OD_DEF_CAT_APPT_CONFIRMED,
  OdAptStatus,
  OdProcStatus,
} from "@/lib/opendental/types";

function asRows<T>(rows: RowDataPacket[]): T[] {
  return rows as unknown as T[];
}

export type OdGhlPatientContactRow = {
  PatNum: number;
  FName: string | null;
  LName: string | null;
  HmPhone: string | null;
  WirelessPhone: string | null;
  Email: string | null;
  /** Open Dental YN: 0 Unknown, 1 Yes, 2 No. */
  TxtMsgOk: number | null;
  DateTStamp: Date | string | null;
};

export type OdGhlAppointmentRow = {
  AptNum: number;
  PatNum: number;
  AptStatus: number;
  AptDateTime: Date | string | null;
  /** Open Dental Pattern chars; each character is typically 5 minutes. */
  Pattern: string | null;
  DateTStamp: Date | string | null;
  AppointmentTypeName: string | null;
  ConfirmedName: string | null;
};

export type OdGhlFutureAppointmentRow = {
  AptNum: number;
  PatNum: number;
  AptStatus: number;
  AptDateTime: Date | string | null;
  Pattern: string | null;
  AppointmentTypeName: string | null;
};

export type OdGhlProcCodeRow = {
  AptNum: number;
  ProcCode: string;
};

export type OdGhlSoldProcRow = {
  ProcNum: number;
  PatNum: number;
  ProcCode: string;
  ProcStatus: number;
  DateTStamp: Date | string | null;
};

const IN_CHUNK = 200;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * MySQL DATETIME string for a DateTStamp cursor (`YYYY-MM-DD HH:mm:ss`).
 *
 * Polls use `DateTStamp > cursor` (not `>=`). After a successful run the cursor
 * is set to the max stamp seen; `>` prevents that boundary row from syncing
 * forever on every subsequent poll.
 */
export function toOdCursor(value: string): string {
  return value.replace("T", " ").replace("Z", "").slice(0, 19);
}

export function odStampToCursor(
  value: Date | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
  const text = String(value).trim();
  if (!text || text.startsWith("0000-00-00")) return null;
  return toOdCursor(text);
}

export async function odDatabaseNow(): Promise<string> {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS nowStamp`,
  );
  const stamp = rows[0]?.nowStamp;
  if (typeof stamp !== "string" || !stamp.trim()) {
    throw new Error("Open Dental did not return NOW()");
  }
  return stamp.trim();
}

async function patientSelectList(): Promise<string> {
  const parts = [
    "PatNum",
    "FName",
    "LName",
    "DATE_FORMAT(DateTStamp, '%Y-%m-%d %H:%i:%s') AS DateTStamp",
  ];
  if (await odHasColumn("patient", "WirelessPhone")) parts.push("WirelessPhone");
  if (await odHasColumn("patient", "HmPhone")) parts.push("HmPhone");
  if (await odHasColumn("patient", "Email")) parts.push("Email");
  if (await odHasColumn("patient", "TxtMsgOk")) parts.push("TxtMsgOk");
  return parts.join(", ");
}

function normalizePatient(row: OdGhlPatientContactRow): OdGhlPatientContactRow {
  const txt =
    row.TxtMsgOk == null || row.TxtMsgOk === ("" as unknown)
      ? null
      : Number(row.TxtMsgOk);
  return {
    PatNum: Number(row.PatNum),
    FName: row.FName ?? null,
    LName: row.LName ?? null,
    HmPhone: row.HmPhone ?? null,
    WirelessPhone: row.WirelessPhone ?? null,
    Email: row.Email ?? null,
    TxtMsgOk: Number.isFinite(txt) ? txt : null,
    DateTStamp: row.DateTStamp ?? null,
  };
}

export async function listOdPatientsForGhlSync(
  updatedSince: string,
): Promise<OdGhlPatientContactRow[]> {
  const select = await patientSelectList();
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT ${select}
     FROM patient
     WHERE DateTStamp > ?
     ORDER BY PatNum`,
    [toOdCursor(updatedSince)],
  );
  return asRows<OdGhlPatientContactRow>(rows).map(normalizePatient);
}

export async function listOdPatientsForGhlByIds(
  patNums: number[],
): Promise<OdGhlPatientContactRow[]> {
  const ids = [...new Set(patNums.filter((id) => Number.isFinite(id)))];
  if (ids.length === 0) return [];
  const select = await patientSelectList();
  const out: OdGhlPatientContactRow[] = [];
  for (const group of chunks(ids, IN_CHUNK)) {
    const placeholders = group.map(() => "?").join(", ");
    const rows = await queryOpenDental<RowDataPacket>(
      `SELECT ${select}
       FROM patient
       WHERE PatNum IN (${placeholders})`,
      group,
    );
    out.push(...asRows<OdGhlPatientContactRow>(rows).map(normalizePatient));
  }
  return out;
}

/**
 * SQL predicate for consult appointments (N9310* / D0150 / D0120 / D0150.2
 * or a consult appointment-type name). `alias` is the appointment table alias.
 */
export function odConsultAppointmentSqlPredicate(alias = "a"): string {
  const examList = CONSULT_EXAM_PROCEDURE_CODES.map(
    (code) => `'${code}'`,
  ).join(", ");
  return `(
      UPPER(IFNULL(${alias}_type.AppointmentTypeName, '')) LIKE '%N9310%'
      OR UPPER(IFNULL(${alias}_type.AppointmentTypeName, '')) LIKE '%ALL ON X%'
      OR UPPER(IFNULL(${alias}_type.AppointmentTypeName, '')) LIKE '%SNAP IN DENTURE%'
      OR UPPER(IFNULL(${alias}_type.AppointmentTypeName, '')) LIKE '%OVER 10K%'
      OR UPPER(IFNULL(${alias}_type.AppointmentTypeName, '')) LIKE '%UNDER 10K%'
      OR UPPER(IFNULL(${alias}_type.AppointmentTypeName, '')) LIKE '%DENTURES CONSULT%'
      OR UPPER(IFNULL(${alias}_type.AppointmentTypeName, '')) LIKE '%DENT CONSULT%'
      OR EXISTS (
        SELECT 1
        FROM procedurelog ${alias}_pl
        INNER JOIN procedurecode ${alias}_pc ON ${alias}_pc.CodeNum = ${alias}_pl.CodeNum
        WHERE ${alias}_pl.AptNum = ${alias}.AptNum
          AND ${alias}_pl.ProcStatus <> ${OdProcStatus.Deleted}
          AND (
            UPPER(TRIM(${alias}_pc.ProcCode)) LIKE 'N9310%'
            OR UPPER(TRIM(${alias}_pc.ProcCode)) IN (${examList})
          )
      )
    )`;
}

function appointmentSelectSql(patternSelect: string): string {
  return `SELECT a.AptNum, a.PatNum, a.AptStatus,
            DATE_FORMAT(a.AptDateTime, '%Y-%m-%d %H:%i:%s') AS AptDateTime,
            ${patternSelect}
            DATE_FORMAT(a.DateTStamp, '%Y-%m-%d %H:%i:%s') AS DateTStamp,
            a_type.AppointmentTypeName AS AppointmentTypeName,
            def.ItemName AS ConfirmedName
     FROM appointment a
     LEFT JOIN appointmenttype a_type
       ON a_type.AppointmentTypeNum = a.AppointmentTypeNum
     LEFT JOIN definition def
       ON def.DefNum = a.Confirmed AND def.Category = ?`;
}

function normalizeAppointmentRow(row: OdGhlAppointmentRow): OdGhlAppointmentRow {
  return {
    AptNum: Number(row.AptNum),
    PatNum: Number(row.PatNum),
    AptStatus: Number(row.AptStatus),
    AptDateTime: row.AptDateTime ?? null,
    Pattern: row.Pattern ?? null,
    DateTStamp: row.DateTStamp ?? null,
    AppointmentTypeName: row.AppointmentTypeName ?? null,
    ConfirmedName: row.ConfirmedName ?? null,
  };
}

export async function listOdAppointmentsForGhlSync(
  updatedSince: string,
): Promise<OdGhlAppointmentRow[]> {
  return listOdAppointmentsForGhlSyncFiltered(updatedSince, "all");
}

export async function listOdConsultAppointmentsForGhlSync(
  updatedSince: string,
): Promise<OdGhlAppointmentRow[]> {
  return listOdAppointmentsForGhlSyncFiltered(updatedSince, "consults");
}

export async function listOdNonConsultAppointmentsForGhlSync(
  updatedSince: string,
): Promise<OdGhlAppointmentRow[]> {
  return listOdAppointmentsForGhlSyncFiltered(updatedSince, "non-consults");
}

async function listOdAppointmentsForGhlSyncFiltered(
  updatedSince: string,
  kind: "all" | "consults" | "non-consults",
): Promise<OdGhlAppointmentRow[]> {
  const hasPattern = await odHasColumn("appointment", "Pattern");
  const patternSelect = hasPattern ? "a.Pattern," : "NULL AS Pattern,";
  const consultPred = odConsultAppointmentSqlPredicate("a");
  const extra =
    kind === "consults"
      ? ` AND ${consultPred}`
      : kind === "non-consults"
        ? ` AND NOT ${consultPred}`
        : "";
  const rows = await queryOpenDental<RowDataPacket>(
    `${appointmentSelectSql(patternSelect)}
     WHERE a.DateTStamp > ?${extra}
     ORDER BY a.DateTStamp, a.AptNum`,
    [OD_DEF_CAT_APPT_CONFIRMED, toOdCursor(updatedSince)],
  );
  return asRows<OdGhlAppointmentRow>(rows).map(normalizeAppointmentRow);
}

/** Scheduled appointments with AptDateTime in the future for the given patients. */
export async function listOdFutureAppointmentsForPatients(
  patNums: number[],
): Promise<OdGhlFutureAppointmentRow[]> {
  const ids = [...new Set(patNums.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return [];
  const hasPattern = await odHasColumn("appointment", "Pattern");
  const patternSelect = hasPattern ? "a.Pattern," : "NULL AS Pattern,";
  const out: OdGhlFutureAppointmentRow[] = [];
  for (const group of chunks(ids, IN_CHUNK)) {
    const placeholders = group.map(() => "?").join(", ");
    const rows = await queryOpenDental<RowDataPacket>(
      `SELECT a.AptNum, a.PatNum, a.AptStatus,
              DATE_FORMAT(a.AptDateTime, '%Y-%m-%d %H:%i:%s') AS AptDateTime,
              ${patternSelect}
              atype.AppointmentTypeName AS AppointmentTypeName
       FROM appointment a
       LEFT JOIN appointmenttype atype
         ON atype.AppointmentTypeNum = a.AppointmentTypeNum
       WHERE a.PatNum IN (${placeholders})
         AND a.AptStatus = ?
         AND a.AptDateTime > NOW()
       ORDER BY a.AptDateTime, a.AptNum`,
      [...group, OdAptStatus.Scheduled],
    );
    for (const row of asRows<OdGhlFutureAppointmentRow>(rows)) {
      out.push({
        AptNum: Number(row.AptNum),
        PatNum: Number(row.PatNum),
        AptStatus: Number(row.AptStatus),
        AptDateTime: row.AptDateTime ?? null,
        Pattern: row.Pattern ?? null,
        AppointmentTypeName: row.AppointmentTypeName ?? null,
      });
    }
  }
  return out;
}

/** Every Scheduled appointment with AptDateTime in the future (backfill source). */
export async function listOdFutureScheduledAppointments(): Promise<
  OdGhlFutureAppointmentRow[]
> {
  const hasPattern = await odHasColumn("appointment", "Pattern");
  const patternSelect = hasPattern ? "a.Pattern," : "NULL AS Pattern,";
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT a.AptNum, a.PatNum, a.AptStatus,
            DATE_FORMAT(a.AptDateTime, '%Y-%m-%d %H:%i:%s') AS AptDateTime,
            ${patternSelect}
            atype.AppointmentTypeName AS AppointmentTypeName
     FROM appointment a
     LEFT JOIN appointmenttype atype
       ON atype.AppointmentTypeNum = a.AppointmentTypeNum
     WHERE a.AptStatus = ?
       AND a.AptDateTime > NOW()
     ORDER BY a.AptDateTime, a.AptNum`,
    [OdAptStatus.Scheduled],
  );
  return asRows<OdGhlFutureAppointmentRow>(rows).map((row) => ({
    AptNum: Number(row.AptNum),
    PatNum: Number(row.PatNum),
    AptStatus: Number(row.AptStatus),
    AptDateTime: row.AptDateTime ?? null,
    Pattern: row.Pattern ?? null,
    AppointmentTypeName: row.AppointmentTypeName ?? null,
  }));
}

export async function listOdAppointmentProcedureCodes(
  aptNums: number[],
): Promise<OdGhlProcCodeRow[]> {
  const ids = [...new Set(aptNums.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return [];
  const out: OdGhlProcCodeRow[] = [];
  for (const group of chunks(ids, IN_CHUNK)) {
    const placeholders = group.map(() => "?").join(", ");
    const rows = await queryOpenDental<RowDataPacket>(
      `SELECT pl.AptNum, pc.ProcCode
       FROM procedurelog pl
       INNER JOIN procedurecode pc ON pc.CodeNum = pl.CodeNum
       WHERE pl.AptNum IN (${placeholders})
         AND pl.ProcStatus <> ?`,
      [...group, OdProcStatus.Deleted],
    );
    for (const row of asRows<OdGhlProcCodeRow>(rows)) {
      const code = row.ProcCode?.trim();
      if (!code) continue;
      out.push({ AptNum: Number(row.AptNum), ProcCode: code });
    }
  }
  return out;
}

export async function listOdSoldProceduresForGhlSync(
  updatedSince: string,
): Promise<OdGhlSoldProcRow[]> {
  const codes = SOLD_PROCEDURES.map((row) => row.code);
  const placeholders = codes.map(() => "?").join(", ");
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT pl.ProcNum, pl.PatNum, pl.ProcStatus, pc.ProcCode,
            DATE_FORMAT(pl.DateTStamp, '%Y-%m-%d %H:%i:%s') AS DateTStamp
     FROM procedurelog pl
     INNER JOIN procedurecode pc ON pc.CodeNum = pl.CodeNum
     WHERE pl.DateTStamp > ?
       AND pl.ProcStatus = ?
       AND pc.ProcCode IN (${placeholders})
     ORDER BY pl.DateTStamp, pl.ProcNum`,
    [toOdCursor(updatedSince), OdProcStatus.Complete, ...codes],
  );
  return asRows<OdGhlSoldProcRow>(rows).map((row) => ({
    ProcNum: Number(row.ProcNum),
    PatNum: Number(row.PatNum),
    ProcCode: row.ProcCode,
    ProcStatus: Number(row.ProcStatus),
    DateTStamp: row.DateTStamp ?? null,
  }));
}
