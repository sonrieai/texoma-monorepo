/**
 * Map Open Dental MySQL rows → Open Dental-shaped payloads for the warehouse.
 * Aggregators and PHI policy continue to consume these shapes.
 */

import type {
  AdjustmentRecord,
  AdjustmentTypeRecord,
  AppointmentRecord,
  ProcedureDescriptor,
  AppointmentTypeRecord,
  ChargeRecord,
  ClaimRecord,
  GuarantorBalanceRecord,
  InsuranceBalanceRecord,
  InsurancePlanRecord,
  PatientRecord,
  PaymentRecord,
  MoneyAmount,
  ProcedureRecord,
  ProviderRecord,
  TreatmentPlanRecord,
  TreatmentPlanStatus,
} from "@/lib/warehouse/types";
import {
  OdAptStatus,
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

function money(amount: number | null | undefined): MoneyAmount {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return { amount: n.toFixed(2), currency: "USD" };
}

/** Convert MySQL DATE/DATETIME / Date to ISO-ish string. */
export function odDateToIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  const s = String(value).trim();
  if (!s || s.startsWith("0000-00-00")) return null;
  // MySQL "YYYY-MM-DD HH:MM:SS" → ISO-ish
  if (/^\d{4}-\d{2}-\d{2} /.test(s)) {
    return `${s.replace(" ", "T")}.000Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T00:00:00.000Z`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

export function odDateToYmd(value: Date | string | null | undefined): string | null {
  const iso = odDateToIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function providerName(row: OdProviderRow): string {
  const parts = [row.FName, row.LName].map((s) => s?.trim()).filter(Boolean);
  if (parts.length) return parts.join(" ");
  return row.Abbr?.trim() || `Provider ${row.ProvNum}`;
}

export function mapOdProvider(row: OdProviderRow): ProviderRecord {
  return {
    id: row.ProvNum,
    name: providerName(row),
    first_name: row.FName?.trim() || undefined,
    last_name: row.LName?.trim() || undefined,
    inactive: Boolean(row.IsHidden),
    updated_at: odDateToIso(row.DateTStamp) ?? undefined,
    foreign_id: String(row.ProvNum),
    foreign_id_type: "opendental",
  };
}

export function mapOdAppointmentType(row: OdAppointmentTypeRow): AppointmentTypeRecord {
  return {
    id: row.AppointmentTypeNum,
    name: row.AppointmentTypeName?.trim() || `Type ${row.AppointmentTypeNum}`,
  };
}

function aptStatusLabel(status: number): string {
  switch (status) {
    case OdAptStatus.Complete:
      return "Complete";
    case OdAptStatus.Broken:
      return "Broken";
    case OdAptStatus.Scheduled:
      return "Scheduled";
    case OdAptStatus.UnschedList:
      return "UnschedList";
    case OdAptStatus.ASAP:
      return "ASAP";
    case OdAptStatus.Planned:
      return "Planned";
    default:
      return "None";
  }
}

export function mapOdAppointment(row: OdAppointmentRow): AppointmentRecord {
  const aptStatus = aptStatusLabel(row.AptStatus);
  const confirmed = Number(row.Confirmed) || 0;
  const start = odDateToIso(row.AptDateTime);
  const arrived = odDateToIso(row.DateTimeArrived);
  const dismissed = odDateToIso(row.DateTimeDismissed);

  return {
    id: row.AptNum,
    patient_id: row.PatNum,
    provider_id: row.ProvNum,
    appointment_type_id:
      row.AppointmentTypeNum && row.AppointmentTypeNum > 0
        ? row.AppointmentTypeNum
        : null,
    start_time: start ?? undefined,
    cancelled: row.AptStatus === OdAptStatus.Broken,
    confirmed: confirmed > 0,
    patient_confirmed: confirmed > 0,
    patient_missed: confirmed === 69 || row.AptStatus === OdAptStatus.Broken,
    checked_out: Boolean(dismissed),
    checkin_at: arrived,
    updated_at: odDateToIso(row.DateTStamp) ?? undefined,
    apt_status: aptStatus,
    appointment_status: aptStatus,
    status: aptStatus,
    confirmation_status: confirmed || null,
    confirmation_id: confirmed || null,
    confirm_id: confirmed || null,
    od_confirm: confirmed || null,
    def_num: confirmed || null,
    foreign_id: String(row.AptNum),
    foreign_id_type: "opendental",
  };
}

export function mapOdProcStatus(status: number): string {
  switch (status) {
    case OdProcStatus.Complete:
      return "Complete";
    case OdProcStatus.TP:
      return "TreatmentPlan";
    case OdProcStatus.ExistingCurrentProvider:
    case OdProcStatus.ExistingOtherProvider:
      return "Existing";
    case OdProcStatus.Deleted:
      return "Deleted";
    case OdProcStatus.Condition:
      return "Condition";
    case OdProcStatus.TreatmentPlanInactive:
      return "Inactive";
    default:
      return String(status);
  }
}

export function mapOdProcedure(row: OdProcedureLogRow): ProcedureRecord {
  const code = row.ProcCode?.trim() || null;
  const startDate = odDateToYmd(row.ProcDate) ?? odDateToYmd(row.DateComplete);
  return {
    id: row.ProcNum,
    patient_id: row.PatNum,
    provider_id: row.ProvNum,
    code,
    name: row.Descript?.trim() || code,
    status: mapOdProcStatus(row.ProcStatus),
    fee: money(Number(row.ProcFee)),
    start_date: startDate,
    end_date: odDateToYmd(row.DateComplete),
    updated_at: odDateToIso(row.DateTStamp) ?? undefined,
    foreign_id: String(row.ProcNum),
    foreign_id_type: "opendental",
    /** Open Dental ProcCat DefNum — used by category sync. */
    data: row.ProcCat != null ? { ProcCat: row.ProcCat } : undefined,
  };
}

/** Completed procedures become ledger charges (OD has no separate charge table). */
export function mapOdProcedureToCharge(row: OdProcedureLogRow): ChargeRecord | null {
  if (row.ProcStatus !== OdProcStatus.Complete) return null;
  const code = row.ProcCode?.trim() || null;
  return {
    id: row.ProcNum,
    provider_id: row.ProvNum,
    patient_id: row.PatNum,
    procedure_id: row.ProcNum,
    procedure_code: code,
    fee: money(Number(row.ProcFee)),
    charged_at: odDateToIso(row.ProcDate) ?? odDateToIso(row.DateComplete),
    deleted_at: null,
    updated_at: odDateToIso(row.DateTStamp) ?? undefined,
    foreign_id: String(row.ProcNum),
    foreign_id_type: "opendental",
  };
}

export function mapOdPaySplit(row: OdPaySplitRow): PaymentRecord {
  const payNote = row.PayNote?.trim() || null;
  return {
    id: row.SplitNum,
    provider_id: row.ProvNum || null,
    patient_id: row.PatNum,
    payment_amount: money(Number(row.SplitAmt)),
    paid_at: odDateToIso(row.DatePay),
    deleted_at: null,
    updated_at: odDateToIso(row.DatePay) ?? undefined,
    payment_type: row.PayTypeName?.trim() || null,
    payment_type_id: row.PayType ?? null,
    type: row.PayTypeName?.trim() || null,
    description: payNote,
    notes: payNote,
    foreign_id: String(row.SplitNum),
    foreign_id_type: "opendental",
  };
}

export function mapOdAdjustment(row: OdAdjustmentRow): AdjustmentRecord {
  return {
    id: row.AdjNum,
    provider_id: row.ProvNum || null,
    adjustment_amount: money(Number(row.AdjAmt)),
    adjusted_at: odDateToIso(row.AdjDate),
    deleted_at: null,
    updated_at: odDateToIso(row.DateEntry) ?? odDateToIso(row.AdjDate) ?? undefined,
    adjustment_type_id: row.AdjType,
    description: row.AdjTypeName?.trim() || null,
    foreign_id: String(row.AdjNum),
    foreign_id_type: "opendental",
  };
}

/**
 * OD AdjType ItemValue often encodes +/- ; treat "subtract"/write-off-ish as writeoff.
 */
export function mapOdAdjTypeDefinition(row: OdDefinitionRow): AdjustmentTypeRecord {
  const name = row.ItemName?.trim() || `Type ${row.DefNum}`;
  const value = (row.ItemValue ?? "").toLowerCase();
  const action =
    value.includes("+") || /add|charge/i.test(name)
      ? "add"
      : value.includes("-") || /write|wo|contractual|adjust/i.test(name)
        ? "subtract"
        : "subtract";
  return {
    id: row.DefNum,
    name,
    active: !row.IsHidden,
    action,
    updated_at: null,
  };
}

function mapTpStatus(tpStatus: number): TreatmentPlanStatus {
  // OD TreatPlanStatus: Saved=0, Active=1, Inactive=2 (varies by version)
  if (tpStatus === 1) return "accepted";
  if (tpStatus === 2) return "not_applicable";
  return "proposed";
}

export function mapOdTreatPlan(
  row: OdTreatPlanRow,
  procs: OdProcTpRow[],
): TreatmentPlanRecord {
  const procedures: ProcedureRecord[] = procs.map((p) => {
    const logStatus =
      p.LogProcStatus != null && p.LogProcStatus !== undefined
        ? Number(p.LogProcStatus)
        : null;
    const status =
      logStatus != null && logStatus > 0
        ? mapOdProcStatus(logStatus)
        : "TreatmentPlan";
    return {
      id: p.ProcNumOrig ?? p.ProcTPNum,
      patient_id: p.PatNum,
      code: p.ProcCode?.trim() || null,
      name: p.Descript?.trim() || p.ProcCode?.trim() || null,
      status,
      fee: money(Number(p.FeeAmt)),
      start_date: odDateToYmd(p.LogProcDate) ?? undefined,
      end_date: odDateToYmd(p.LogDateComplete) ?? odDateToYmd(p.LogProcDate) ?? undefined,
    };
  });

  return {
    id: row.TreatPlanNum,
    name: row.Heading?.trim() || `TP ${row.TreatPlanNum}`,
    patient_id: row.PatNum,
    updated_at: odDateToIso(row.DateTStamp) ?? undefined,
    status: mapTpStatus(row.TPStatus),
    procedures,
    foreign_id: String(row.TreatPlanNum),
    foreign_id_type: "opendental",
  };
}

function mapClaimStatus(raw: string | null): string {
  if (!raw) return "draft";
  const s = raw.trim().toUpperCase();
  // OD ClaimStatus: U=Unsent, W=Waiting, S=Sent, R=Received, H=Hold, I=InProcess, etc.
  if (s === "R" || s === "RECEIVED") return "received";
  if (s === "S" || s === "SENT") return "sent";
  if (s === "U" || s === "UNSENT") return "draft";
  if (s === "C" || s === "CANCELED" || s === "CANCELLED") return "canceled";
  if (s === "H" || s === "HOLD") return "hold";
  if (s === "W" || s === "WAITING") return "waiting";
  return raw.toLowerCase();
}

function odYmdAfterOdEpoch(ymd: string | null): ymd is string {
  return Boolean(ymd && ymd > "0001-01-01");
}

/** Open Dental resubmit / replacement (not timezone same-day noise). */
export function odClaimNeedsCorrection(row: OdClaimRow): boolean {
  if ((Number(row.CorrectionType) || 0) > 0) return true;
  const sent = odDateToYmd(row.DateSent);
  const orig = odDateToYmd(row.DateSentOrig);
  if (odYmdAfterOdEpoch(sent) && odYmdAfterOdEpoch(orig) && orig !== sent) {
    return true;
  }
  const resent = odDateToYmd(row.DateResent);
  if (odYmdAfterOdEpoch(sent) && odYmdAfterOdEpoch(resent) && resent !== sent) {
    return true;
  }
  return false;
}

export function mapOdClaim(row: OdClaimRow): ClaimRecord {
  const needsCorrection = odClaimNeedsCorrection(row);
  return {
    id: row.ClaimNum,
    patient_id: row.PatNum,
    provider_id: row.ProvTreat || null,
    status: mapClaimStatus(row.ClaimStatus),
    claim_type: row.ClaimType?.trim() || null,
    correction_type: Number(row.CorrectionType) || 0,
    needs_correction: needsCorrection,
    was_resent: needsCorrection,
    sent_at: odDateToIso(row.DateSent),
    received_at: odDateToIso(row.DateReceived),
    primary_insurance_plan_id: row.PlanNum || null,
    date_of_service: odDateToYmd(row.DateService),
    totals: {
      amount_billed_to_insurance: money(Number(row.ClaimFee)),
      estimated_insurance_payment: money(Number(row.InsPayEst)),
      insurance_payment: money(Number(row.InsPayAmt)),
      write_off: money(Number(row.WriteOff)),
    },
    updated_at: odDateToIso(row.DateTStamp) ?? undefined,
    deleted_at: null,
    foreign_id: String(row.ClaimNum),
    foreign_id_type: "opendental",
  };
}

export function mapOdInsPlan(row: OdInsPlanRow): InsurancePlanRecord {
  return {
    id: row.PlanNum,
    name: row.CarrierName?.trim() || row.GroupName?.trim() || `Plan ${row.PlanNum}`,
    updated_at: undefined,
    foreign_id: String(row.PlanNum),
    foreign_id_type: "opendental",
  };
}

export function resolveGuarantorTotalBalanceDollars(
  row: OdGuarantorBalanceRow,
): number {
  const agingSum =
    (Number(row.Bal_0_30) || 0) +
    (Number(row.Bal_31_60) || 0) +
    (Number(row.Bal_61_90) || 0) +
    (Number(row.BalOver90) || 0);
  const est = Number(row.EstBalance) || 0;
  const fromCol = Number(row.TotBal ?? est) || 0;
  if (agingSum > 0 && fromCol <= 0) return agingSum;
  if (fromCol > 0) return fromCol;
  if (est > 0) return est;
  return agingSum;
}

export function mapOdGuarantorBalance(row: OdGuarantorBalanceRow): GuarantorBalanceRecord {
  return {
    id: row.PatNum,
    guarantor_id: row.PatNum,
    total_balance: money(resolveGuarantorTotalBalanceDollars(row)),
    total_balance_under_30: money(Number(row.Bal_0_30)),
    total_balance_31_60: money(Number(row.Bal_31_60)),
    total_balance_61_90: money(Number(row.Bal_61_90)),
    total_balance_over_90: money(Number(row.BalOver90)),
    insurance_estimate: money(Number(row.InsEst)),
    updated_at: undefined,
  };
}

/** Insurance AR proxy: split guarantor InsEst across patient aging buckets. */
export function mapOdInsuranceBalance(row: OdGuarantorBalanceRow): InsuranceBalanceRecord {
  const b0 = Number(row.Bal_0_30) || 0;
  const b1 = Number(row.Bal_31_60) || 0;
  const b2 = Number(row.Bal_61_90) || 0;
  const b3 = Number(row.BalOver90) || 0;
  const agingSum = b0 + b1 + b2 + b3;
  const insEst = Math.max(0, Number(row.InsEst) || 0);
  const alloc = (part: number) =>
    insEst > 0 && agingSum > 0 ? insEst * (part / agingSum) : 0;

  return {
    id: row.PatNum,
    patient_id: row.PatNum,
    guarantor_id: row.PatNum,
    estimated_amount_under_30: money(alloc(b0)),
    estimated_amount_31_60: money(alloc(b1)),
    estimated_amount_61_90: money(alloc(b2)),
    estimated_amount_over_90: money(alloc(b3)),
    updated_at: undefined,
  };
}

/**
 * Build de-identified-capable PatientRecord (PHI strip happens at upsert).
 * Primary carrier from patplan ordinal 1 join.
 */
export function mapOdPatient(
  row: OdPatientRow,
  primaryCarrier: string | null,
): PatientRecord {
  return {
    id: row.PatNum,
    first_name: row.FName?.trim() || undefined,
    last_name: row.LName?.trim() || undefined,
    inactive: Number(row.PatStatus) !== 0, // 0 = Patient (active)
    foreign_id: String(row.PatNum),
    foreign_id_type: "opendental",
    updated_at: odDateToIso(row.DateTStamp) ?? undefined,
    bio: {
      city: row.City?.trim() || null,
      state: row.State?.trim() || null,
      zip_code: row.Zip?.trim() || null,
      date_of_birth: odDateToYmd(row.Birthdate),
    },
    insurance_plans:
      primaryCarrier != null
        ? [{ name: primaryCarrier, ordinal: 1 }]
        : undefined,
  };
}

export function buildPrimaryCarrierMap(
  rows: OdPatPlanJoinRow[],
): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of rows) {
    const name = row.CarrierName?.trim();
    if (!name) continue;
    if (!map.has(row.PatNum)) map.set(row.PatNum, name);
  }
  return map;
}

/** Convert OD procedurecode rows to Open Dental descriptor shape for CDT sync. */
export function mapOdProcedureCodeToDescriptor(
  row: OdProcedureCodeRow,
): ProcedureDescriptor {
  return {
    id: row.CodeNum,
    code: row.ProcCode?.trim() || null,
    name: row.Descript?.trim() || row.ProcCode?.trim() || null,
    descriptor_type: "procedure_code",
    active: true,
    foreign_id: String(row.CodeNum),
    foreign_id_type: "opendental",
    data: { ProcCat: row.ProcCat },
  };
}

export function mapOdProcCatDefinition(
  row: OdDefinitionRow,
  codeCount = 0,
): { procCatId: number; name: string; hidden: boolean; codeCount: number } {
  return {
    procCatId: row.DefNum,
    name: row.ItemName?.trim() || `Category ${row.DefNum}`,
    hidden: Boolean(row.IsHidden),
    codeCount,
  };
}
