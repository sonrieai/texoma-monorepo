/**
 * Read-only Open Dental MySQL queries for live dashboard loads.
 * All statements are SELECT-only; never mutate the practice database.
 */

import type { RowDataPacket } from "mysql2";
import { queryOpenDental } from "@/lib/opendental/mysql";
import { odHasColumn, odPickColumn } from "@/lib/opendental/schema-columns";
import {
  OD_DEF_CAT_ADJ_TYPES,
  OD_DEF_CAT_PAYMENT_TYPES,
  OD_DEF_CAT_PROC_CODE_CATS,
  OdProcStatus,
  type OdAdjustmentRow,
  type OdAppointmentRow,
  type OdAppointmentTypeRow,
  type OdClaimProcRow,
  type OdClaimRow,
  type OdDefinitionRow,
  type OdGuarantorBalanceRow,
  type OdInsPlanRow,
  type OdPatPlanJoinRow,
  type OdPatientRow,
  type OdPaySplitRow,
  type OdProcedureCodeRow,
  type OdProcedureLogRow,
  type OdProcTpRow,
  type OdProviderRow,
  type OdTreatPlanRow,
} from "@/lib/opendental/types";

function asRows<T>(rows: RowDataPacket[]): T[] {
  return rows as unknown as T[];
}

export type OdDateWindow = {
  /** Inclusive YYYY-MM-DD */
  startYmd: string;
  /** Inclusive YYYY-MM-DD */
  endYmd: string;
};

export async function listOdProviders(): Promise<OdProviderRow[]> {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT ProvNum, Abbr, FName, LName, IsHidden, DateTStamp
     FROM provider
     ORDER BY ProvNum`,
  );
  return asRows<OdProviderRow>(rows);
}

export async function listOdAppointmentTypes(): Promise<OdAppointmentTypeRow[]> {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT AppointmentTypeNum, AppointmentTypeName
     FROM appointmenttype
     ORDER BY AppointmentTypeNum`,
  );
  return asRows<OdAppointmentTypeRow>(rows);
}

/** Provider + type only, for the treatment-coordinator roster. */
export async function listOdAppointmentProvidersByType(
  window: OdDateWindow,
  typeIds: number[],
  clinicNums?: number[],
): Promise<{ ProvNum: number; AppointmentTypeNum: number }[]> {
  const ids = typeIds.filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return [];
  const params: unknown[] = [
    window.startYmd,
    `${window.endYmd} 23:59:59`,
    ...ids,
  ];
  let clinicClause = "";
  if (clinicNums && clinicNums.length > 0) {
    clinicClause = ` AND ClinicNum IN (${clinicNums.map(() => "?").join(",")})`;
    params.push(...clinicNums);
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT ProvNum, AppointmentTypeNum
     FROM appointment
     WHERE AptDateTime >= ? AND AptDateTime <= ?
       AND AppointmentTypeNum IN (${ids.map(() => "?").join(",")})
       AND ProvNum > 0${clinicClause}`,
    params,
  );
  return asRows<{ ProvNum: number; AppointmentTypeNum: number }>(rows);
}

export async function listOdAppointments(
  window: OdDateWindow,
  clinicNums?: number[],
): Promise<OdAppointmentRow[]> {
  const params: unknown[] = [window.startYmd, `${window.endYmd} 23:59:59`];
  let clinicClause = "";
  if (clinicNums && clinicNums.length > 0) {
    clinicClause = ` AND ClinicNum IN (${clinicNums.map(() => "?").join(",")})`;
    params.push(...clinicNums);
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT AptNum, PatNum, ProvNum, AptStatus, AptDateTime, Confirmed,
            AppointmentTypeNum, ClinicNum, DateTStamp,
            DateTimeArrived, DateTimeDismissed, IsNewPatient
     FROM appointment
     WHERE AptDateTime >= ? AND AptDateTime <= ?${clinicClause}`,
    params,
  );
  return asRows<OdAppointmentRow>(rows);
}

/** City/state/ZIP and status only — no names or birth dates. */
export async function listOdPatientGeoRows(): Promise<
  {
    PatNum: number;
    City: string | null;
    State: string | null;
    Zip: string | null;
    PatStatus: number;
  }[]
> {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT PatNum, City, State, Zip, PatStatus
     FROM patient`,
  );
  return asRows<{
    PatNum: number;
    City: string | null;
    State: string | null;
    Zip: string | null;
    PatStatus: number;
  }>(rows);
}

/** Completed procedure fees in the range, summed to cents per patient. */
export async function listOdProductionCentsByPatient(
  window: OdDateWindow,
  clinicNums?: number[],
): Promise<{ PatNum: number; Cents: number }[]> {
  const params: unknown[] = [window.startYmd, window.endYmd];
  let clinicClause = "";
  if (clinicNums && clinicNums.length > 0) {
    clinicClause = ` AND pl.ClinicNum IN (${clinicNums.map(() => "?").join(",")})`;
    params.push(...clinicNums);
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT pl.PatNum, SUM(ROUND(pl.ProcFee * 100, 0)) AS Cents
     FROM procedurelog pl
     WHERE pl.ProcDate >= ? AND pl.ProcDate <= ?
       AND pl.ProcStatus = ${OdProcStatus.Complete}
       AND pl.ProcFee > 0${clinicClause}
     GROUP BY pl.PatNum`,
    params,
  );
  return asRows<{ PatNum: number; Cents: number }>(rows);
}

export async function listOdPatients(
  updatedSince?: string | null,
): Promise<OdPatientRow[]> {
  const params: unknown[] = [];
  let where = "WHERE 1=1";
  if (updatedSince) {
    where += " AND DateTStamp >= ?";
    params.push(updatedSince.replace("T", " ").replace("Z", "").slice(0, 19));
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT PatNum, Guarantor, City, State, Zip, Birthdate,
            PatStatus, ClinicNum, DateTStamp, PriProv, DateFirstVisit
     FROM patient
     ${where}`,
    params,
  );
  return asRows<OdPatientRow>(rows);
}

export async function listOdProcedureCodes(): Promise<OdProcedureCodeRow[]> {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT CodeNum, ProcCode, Descript, ProcCat
     FROM procedurecode
     ORDER BY CodeNum`,
  );
  return asRows<OdProcedureCodeRow>(rows);
}

export async function listOdProcedureLogs(
  window: OdDateWindow,
  clinicNums?: number[],
): Promise<OdProcedureLogRow[]> {
  const params: unknown[] = [window.startYmd, window.endYmd];
  let clinicClause = "";
  if (clinicNums && clinicNums.length > 0) {
    clinicClause = ` AND pl.ClinicNum IN (${clinicNums.map(() => "?").join(",")})`;
    params.push(...clinicNums);
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT pl.ProcNum, pl.PatNum, pl.ProvNum, pl.CodeNum, pl.ProcStatus,
            pl.ProcDate, pl.ProcFee, pl.AptNum, pl.ClinicNum, pl.DateTStamp,
            pl.DateComplete, pc.ProcCode, pc.Descript, pc.ProcCat
     FROM procedurelog pl
     LEFT JOIN procedurecode pc ON pc.CodeNum = pl.CodeNum
     WHERE pl.ProcDate >= ? AND pl.ProcDate <= ?
       AND pl.ProcStatus = ${OdProcStatus.Complete}${clinicClause}`,
    params,
  );
  return asRows<OdProcedureLogRow>(rows);
}

export async function listOdDefinitions(
  category?: number,
): Promise<OdDefinitionRow[]> {
  const params: unknown[] = [];
  let where = "";
  if (category != null) {
    where = "WHERE Category = ?";
    params.push(category);
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT DefNum, Category, ItemName, ItemValue, ItemOrder, IsHidden
     FROM definition
     ${where}
     ORDER BY Category, ItemOrder, DefNum`,
    params,
  );
  return asRows<OdDefinitionRow>(rows);
}

export async function listOdAdjTypeDefinitions(): Promise<OdDefinitionRow[]> {
  return listOdDefinitions(OD_DEF_CAT_ADJ_TYPES);
}

export async function listOdPaymentTypeDefinitions(): Promise<OdDefinitionRow[]> {
  return listOdDefinitions(OD_DEF_CAT_PAYMENT_TYPES);
}

export async function listOdProcCatDefinitions(): Promise<OdDefinitionRow[]> {
  return listOdDefinitions(OD_DEF_CAT_PROC_CODE_CATS);
}

export async function listOdPaySplits(
  window: OdDateWindow,
  clinicNums?: number[],
): Promise<OdPaySplitRow[]> {
  const params: unknown[] = [window.startYmd, window.endYmd];
  let clinicClause = "";
  if (clinicNums && clinicNums.length > 0) {
    clinicClause = ` AND ps.ClinicNum IN (${clinicNums.map(() => "?").join(",")})`;
    params.push(...clinicNums);
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT ps.SplitNum, ps.PayNum, ps.PatNum, ps.ProvNum, ps.SplitAmt,
            ps.DatePay, ps.ProcNum, ps.UnearnedType, ps.ClinicNum,
            p.PayType, p.PayNote, p.CheckNum, d.ItemName AS PayTypeName
     FROM paysplit ps
     INNER JOIN payment p ON p.PayNum = ps.PayNum
     LEFT JOIN definition d ON d.DefNum = p.PayType
     WHERE ps.DatePay >= ? AND ps.DatePay <= ?${clinicClause}`,
    params,
  );
  return asRows<OdPaySplitRow>(rows);
}

export async function listOdAdjustments(
  window: OdDateWindow,
  clinicNums?: number[],
): Promise<OdAdjustmentRow[]> {
  const params: unknown[] = [window.startYmd, window.endYmd];
  let clinicClause = "";
  if (clinicNums && clinicNums.length > 0) {
    clinicClause = ` AND a.ClinicNum IN (${clinicNums.map(() => "?").join(",")})`;
    params.push(...clinicNums);
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT a.AdjNum, a.PatNum, a.ProvNum, a.AdjDate, a.AdjAmt, a.AdjType,
            a.DateEntry, a.ClinicNum, d.ItemName AS AdjTypeName
     FROM adjustment a
     LEFT JOIN definition d ON d.DefNum = a.AdjType
     WHERE a.AdjDate >= ? AND a.AdjDate <= ?${clinicClause}`,
    params,
  );
  return asRows<OdAdjustmentRow>(rows);
}

export async function listOdTreatPlans(
  updatedSince?: string | null,
  completedProcWindow?: OdDateWindow | null,
): Promise<OdTreatPlanRow[]> {
  const filterCol =
    (await odPickColumn("treatplan", "DateTStamp", "DateTP")) ?? "DateTP";
  const stampSelect = (await odHasColumn("treatplan", "DateTStamp"))
    ? "DateTStamp"
    : `${filterCol} AS DateTStamp`;
  const params: unknown[] = [];
  let where = "WHERE 1=1";
  if (updatedSince && completedProcWindow) {
    where = `WHERE (${filterCol} >= ? OR TreatPlanNum IN (
      SELECT pt.TreatPlanNum
      FROM proctp pt
      INNER JOIN procedurelog pl
        ON pl.ProcNum = pt.ProcNumOrig AND pt.ProcNumOrig > 0
      WHERE pl.ProcStatus = 2
        AND pl.ProcDate >= ? AND pl.ProcDate <= ?
    ))`;
    params.push(
      updatedSince.replace("T", " ").replace("Z", "").slice(0, 19),
      completedProcWindow.startYmd,
      completedProcWindow.endYmd,
    );
  } else if (updatedSince) {
    where += ` AND ${filterCol} >= ?`;
    params.push(updatedSince.replace("T", " ").replace("Z", "").slice(0, 19));
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT TreatPlanNum, PatNum, DateTP, Heading, TPStatus, ${stampSelect}
     FROM treatplan
     ${where}`,
    params,
  );
  return asRows<OdTreatPlanRow>(rows);
}

const PROC_TP_CHUNK_SIZE = 800;
const PROC_TP_CONCURRENCY = 4;

async function listOdProcTpChunk(chunk: number[]): Promise<OdProcTpRow[]> {
  const placeholders = chunk.map(() => "?").join(",");
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT pt.ProcTPNum, pt.TreatPlanNum, pt.PatNum, pt.ProcNumOrig, pt.ProcCode,
            pt.Descript, pt.FeeAmt, pt.Priority,
            pl.ProcStatus AS LogProcStatus, pl.ProcDate AS LogProcDate,
            pl.DateComplete AS LogDateComplete, pl.ProcFee AS LogProcFee
     FROM proctp pt
     LEFT JOIN procedurelog pl ON pl.ProcNum = pt.ProcNumOrig AND pt.ProcNumOrig > 0
     WHERE pt.TreatPlanNum IN (${placeholders})`,
    chunk,
  );
  return asRows<OdProcTpRow>(rows);
}

export async function listOdProcTps(
  treatPlanNums: number[],
): Promise<OdProcTpRow[]> {
  if (treatPlanNums.length === 0) return [];
  const chunks: number[][] = [];
  for (let i = 0; i < treatPlanNums.length; i += PROC_TP_CHUNK_SIZE) {
    chunks.push(treatPlanNums.slice(i, i + PROC_TP_CHUNK_SIZE));
  }
  const out: OdProcTpRow[] = [];
  for (let i = 0; i < chunks.length; i += PROC_TP_CONCURRENCY) {
    const parts = await Promise.all(
      chunks.slice(i, i + PROC_TP_CONCURRENCY).map(listOdProcTpChunk),
    );
    for (const part of parts) out.push(...part);
  }
  return out;
}

export async function listOdClaims(
  window: OdDateWindow,
  clinicNums?: number[],
): Promise<OdClaimRow[]> {
  const params: unknown[] = [
    window.startYmd,
    window.endYmd,
    window.startYmd,
    window.endYmd,
  ];
  let clinicClause = "";
  if (clinicNums && clinicNums.length > 0) {
    clinicClause = ` AND ClinicNum IN (${clinicNums.map(() => "?").join(",")})`;
    params.push(...clinicNums);
  }
  const stampSelect = (await odHasColumn("claim", "DateTStamp"))
    ? "DateTStamp"
    : "NULL AS DateTStamp";
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT ClaimNum, PatNum, PlanNum, ClaimStatus, ClaimType, DateService,
            DateSent, DateSentOrig, DateReceived, DateResent, ClaimFee, InsPayEst,
            InsPayAmt, WriteOff, CorrectionType, ProvTreat, ClinicNum, ${stampSelect}
     FROM claim
     WHERE ((DateService >= ? AND DateService <= ?)
        OR (DateSent >= ? AND DateSent <= ?))${clinicClause}`,
    params,
  );
  return asRows<OdClaimRow>(rows);
}

/** Received and supplemental claim lines. Insurance pay and write-off live here, not on the claim header. */
export async function listOdClaimProcs(
  window: OdDateWindow,
  clinicNums?: number[],
): Promise<OdClaimProcRow[]> {
  const params: unknown[] = [window.startYmd, window.endYmd];
  let clinicClause = "";
  if (clinicNums && clinicNums.length > 0 && (await odHasColumn("claimproc", "ClinicNum"))) {
    clinicClause = ` AND ClinicNum IN (${clinicNums.map(() => "?").join(",")})`;
    params.push(...clinicNums);
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT cp.ClaimProcNum, cp.PatNum, cp.ProvNum, cp.Status, cp.InsPayAmt,
            cp.WriteOff, cp.DateCP, c.CarrierName
     FROM claimproc cp
     LEFT JOIN insplan ip ON ip.PlanNum = cp.PlanNum
     LEFT JOIN carrier c ON c.CarrierNum = ip.CarrierNum
     WHERE cp.Status IN (1, 4)
       AND cp.DateCP >= ? AND cp.DateCP <= ?${clinicClause.replaceAll("ClinicNum", "cp.ClinicNum")}`,
    params,
  );
  return asRows<OdClaimProcRow>(rows);
}

export async function listOdInsPlans(): Promise<OdInsPlanRow[]> {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT p.PlanNum, p.CarrierNum, p.GroupName, p.GroupNum, c.CarrierName
     FROM insplan p
     LEFT JOIN carrier c ON c.CarrierNum = p.CarrierNum
     ORDER BY p.PlanNum`,
  );
  return asRows<OdInsPlanRow>(rows);
}

export async function listOdPrimaryPatPlans(): Promise<OdPatPlanJoinRow[]> {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT pp.PatPlanNum, pp.PatNum, pp.Ordinal, s.PlanNum, c.CarrierName
     FROM patplan pp
     INNER JOIN inssub s ON s.InsSubNum = pp.InsSubNum
     INNER JOIN insplan ip ON ip.PlanNum = s.PlanNum
     LEFT JOIN carrier c ON c.CarrierNum = ip.CarrierNum
     WHERE pp.Ordinal = 1`,
  );
  return asRows<OdPatPlanJoinRow>(rows);
}

/** Guarantors only — aging fields from patient table (no names). */
export async function listOdGuarantorBalances(): Promise<OdGuarantorBalanceRow[]> {
  const totalBalCol =
    (await odPickColumn("patient", "TotBal", "BalTotal")) ?? "EstBalance";
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT PatNum, Bal_0_30, Bal_31_60, Bal_61_90, BalOver90, InsEst,
            ${totalBalCol} AS TotBal, EstBalance
     FROM patient
     WHERE PatNum = Guarantor`,
  );
  return asRows<OdGuarantorBalanceRow>(rows);
}
