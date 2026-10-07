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
            DateTimeArrived, DateTimeDismissed
     FROM appointment
     WHERE AptDateTime >= ? AND AptDateTime <= ?${clinicClause}
     ORDER BY AptNum`,
    params,
  );
  return asRows<OdAppointmentRow>(rows);
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
    `SELECT PatNum, Guarantor, FName, LName, City, State, Zip, Birthdate,
            PatStatus, ClinicNum, DateTStamp, PriProv
     FROM patient
     ${where}
     ORDER BY PatNum`,
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
       AND pl.ProcStatus <> ${OdProcStatus.Deleted}${clinicClause}
     ORDER BY pl.ProcNum`,
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
     WHERE ps.DatePay >= ? AND ps.DatePay <= ?${clinicClause}
     ORDER BY ps.SplitNum`,
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
     WHERE a.AdjDate >= ? AND a.AdjDate <= ?${clinicClause}
     ORDER BY a.AdjNum`,
    params,
  );
  return asRows<OdAdjustmentRow>(rows);
}

export async function listOdTreatPlans(
  updatedSince?: string | null,
): Promise<OdTreatPlanRow[]> {
  const filterCol =
    (await odPickColumn("treatplan", "DateTStamp", "DateTP")) ?? "DateTP";
  const stampSelect = (await odHasColumn("treatplan", "DateTStamp"))
    ? "DateTStamp"
    : `${filterCol} AS DateTStamp`;
  const params: unknown[] = [];
  let where = "WHERE 1=1";
  if (updatedSince) {
    where += ` AND ${filterCol} >= ?`;
    params.push(updatedSince.replace("T", " ").replace("Z", "").slice(0, 19));
  }
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT TreatPlanNum, PatNum, DateTP, Heading, TPStatus, ${stampSelect}
     FROM treatplan
     ${where}
     ORDER BY TreatPlanNum`,
    params,
  );
  return asRows<OdTreatPlanRow>(rows);
}

const PROC_TP_CHUNK_SIZE = 800;

export async function listOdProcTps(
  treatPlanNums: number[],
): Promise<OdProcTpRow[]> {
  if (treatPlanNums.length === 0) return [];
  const out: OdProcTpRow[] = [];
  for (let i = 0; i < treatPlanNums.length; i += PROC_TP_CHUNK_SIZE) {
    const chunk = treatPlanNums.slice(i, i + PROC_TP_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await queryOpenDental<RowDataPacket>(
      `SELECT pt.ProcTPNum, pt.TreatPlanNum, pt.PatNum, pt.ProcNumOrig, pt.ProcCode,
              pt.Descript, pt.FeeAmt, pt.Priority,
              pl.ProcStatus AS LogProcStatus, pl.ProcDate AS LogProcDate,
              pl.DateComplete AS LogDateComplete
       FROM proctp pt
       LEFT JOIN procedurelog pl ON pl.ProcNum = pt.ProcNumOrig AND pt.ProcNumOrig > 0
       WHERE pt.TreatPlanNum IN (${placeholders})
       ORDER BY pt.TreatPlanNum, pt.ProcTPNum`,
      chunk,
    );
    out.push(...asRows<OdProcTpRow>(rows));
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
        OR (DateSent >= ? AND DateSent <= ?))${clinicClause}
     ORDER BY ClaimNum`,
    params,
  );
  return asRows<OdClaimRow>(rows);
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
     WHERE pp.Ordinal = 1
     ORDER BY pp.PatNum`,
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
     WHERE PatNum = Guarantor
     ORDER BY PatNum`,
  );
  return asRows<OdGuarantorBalanceRow>(rows);
}
