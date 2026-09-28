export type PatientRecord = {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  foreign_id?: string | null;
  foreign_id_type?: string | null;
  inactive?: boolean;
  bio?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AppointmentRecord = {
  id?: number;
  patient_id?: number;
  provider_id?: number;
  provider_name?: string;
  appointment_type_id?: number | null;
  start_time?: string;
  cancelled?: boolean;
  confirmed?: boolean;
  patient_confirmed?: boolean;
  patient_missed?: boolean;
  checked_out?: boolean;
  checkin_at?: string | null;
  [key: string]: unknown;
};

export type AppointmentTypeRecord = {
  id: number;
  name?: string;
  description?: string | null;
  [key: string]: unknown;
};

/** Open Dental / PMS procedure code or EHR appointment type from GET /locations/{id}/appointment_descriptors */
export type ProcedureDescriptor = {
  id?: number;
  name?: string | null;
  code?: string | null;
  descriptor_type?: string | null;
  active?: boolean;
  foreign_id?: string | null;
  foreign_id_type?: string | null;
  [key: string]: unknown;
};

export type ProviderRecord = {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
};

export type LocationRecord = {
  id: number;
  name?: string;
  [key: string]: unknown;
};

/** Monetary — amount is dollars as a string (e.g. "62.00"). */
export type MoneyAmount = {
  amount?: string | null;
  currency?: string | null;
};

export type ProcedureRecord = {
  id?: number;
  patient_id?: number | null;
  provider_id?: number | null;
  code?: string | null;
  name?: string | null;
  status?: string | null;
  fee?: MoneyAmount | null;
  start_date?: string | null;
  end_date?: string | null;
  updated_at?: string;
  [key: string]: unknown;
};

export type ChargeRecord = {
  id?: number;
  provider_id?: number | null;
  patient_id?: number | null;
  procedure_id?: number | null;
  procedure_code?: string | null;
  fee?: MoneyAmount | null;
  charged_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string;
  [key: string]: unknown;
};

export type PaymentRecord = {
  id?: number;
  provider_id?: number | null;
  patient_id?: number | null;
  payment_amount?: MoneyAmount | null;
  paid_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string;
  payment_type?: string | null;
  payment_type_id?: number | null;
  type?: string | null;
  description?: string | null;
  notes?: string | null;
  payment_method?: string | null;
  /** Source payment payload */
  claim_id?: number | null;
  insurance_plan_id?: number | null;
  /** Legacy/alternate field name — keep for compatibility */
  insurance_claim_id?: number | null;
  [key: string]: unknown;
};

export type FeeScheduleRecord = {
  id: number;
  name?: string | null;
  active?: boolean | null;
  location_id?: number | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type FeeScheduleProcedureRecord = {
  id?: number;
  code?: string | null;
  fee?: MoneyAmount | null;
  fee_schedule_id?: number | null;
  location_id?: number | null;
  procedure_code_id?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type AdjustmentRecord = {
  id?: number;
  provider_id?: number | null;
  adjustment_amount?: MoneyAmount | null;
  adjusted_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string;
  adjustment_type_id?: number | null;
  description?: string | null;
  [key: string]: unknown;
};

export type AdjustmentTypeRecord = {
  id: number;
  name?: string | null;
  active?: boolean | null;
  action?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type TreatmentPlanStatus =
  | "not_applicable"
  | "proposed"
  | "accepted"
  | "rejected"
  | "completed";

export type TreatmentPlanRecord = {
  id?: number;
  name?: string | null;
  patient_id?: number | null;
  updated_at?: string;
  status?: TreatmentPlanStatus | null;
  procedures?: ProcedureRecord[];
  [key: string]: unknown;
};

export type GuarantorBalanceRecord = {
  id?: number;
  guarantor_id?: number | null;
  location_id?: number | null;
  updated_at?: string;
  total_balance?: MoneyAmount | null;
  total_balance_over_90?: MoneyAmount | null;
  total_balance_61_90?: MoneyAmount | null;
  total_balance_31_60?: MoneyAmount | null;
  total_balance_under_30?: MoneyAmount | null;
  guarantor_portion?: MoneyAmount | null;
  insurance_estimate?: MoneyAmount | null;
  write_off_estimate?: MoneyAmount | null;
  [key: string]: unknown;
};

/** Claim status. Open Dental sync also emits `paid` (not only `received`). */
export type ClaimStatus =
  | "draft"
  | "sent"
  | "received"
  | "paid"
  | "canceled";

export type ClaimTotals = {
  amount_billed_to_insurance?: MoneyAmount | null;
  estimated_insurance_payment?: MoneyAmount | null;
  insurance_payment?: MoneyAmount | null;
  write_off?: MoneyAmount | null;
};

/** GET /claims — Open Dental via Synchronizer (v20240412 / v3.0.0). */
export type ClaimRecord = {
  id?: number;
  location_id?: number | null;
  patient_id?: number | null;
  provider_id?: number | null;
  guarantor_id?: number | null;
  status?: ClaimStatus | string | null;
  received_at?: string | null;
  sent_at?: string | null;
  note?: string | null;
  primary_insurance_plan_id?: number | null;
  secondary_insurance_plan_id?: number | null;
  date_of_service?: string | null;
  totals?: ClaimTotals | null;
  updated_at?: string;
  deleted_at?: string | null;
  [key: string]: unknown;
};

/** GET /insurance_balances — insurance-only AR aging (Open Dental supported). */
export type InsuranceBalanceRecord = {
  id?: number;
  patient_id?: number | null;
  guarantor_id?: number | null;
  location_id?: number | null;
  updated_at?: string;
  estimated_amount_under_30?: MoneyAmount | null;
  estimated_amount_31_60?: MoneyAmount | null;
  estimated_amount_61_90?: MoneyAmount | null;
  estimated_amount_over_90?: MoneyAmount | null;
  billed_amount_under_30?: MoneyAmount | null;
  billed_amount_31_60?: MoneyAmount | null;
  billed_amount_61_90?: MoneyAmount | null;
  billed_amount_over_90?: MoneyAmount | null;
  [key: string]: unknown;
};

/** GET /insurance_plans — payer names for claim/payment plan ids. */
export type InsurancePlanRecord = {
  id?: number;
  name?: string | null;
  payer_id?: string | null;
  group_num?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
  [key: string]: unknown;
};

/** Parse Price.amount (dollars string) to integer cents. */
export function moneyToCents(price: MoneyAmount | null | undefined): number {
  if (!price?.amount) return 0;
  const n = Number.parseFloat(price.amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}


/** Resolve an appointment type identifier without reading patient embeds. */
export function appointmentTypeId(appt: AppointmentRecord): number | null {
  if (typeof appt.appointment_type_id === "number") return appt.appointment_type_id;
  const nested = appt.appointment_type;
  if (nested && typeof nested === "object") {
    const id = (nested as { id?: unknown }).id;
    if (typeof id === "number") return id;
  }
  return null;
}

export function mapAttendance(
  appointment: AppointmentRecord,
): "show" | "no_show" | "cancelled" | "unknown" {
  if (appointment.cancelled) return "cancelled";
  if (appointment.patient_missed === true) return "no_show";
  if (appointment.checkin_at || appointment.checked_out === true) return "show";
  if (
    appointment.confirmed === true ||
    appointment.patient_confirmed === true
  ) {
    return "show";
  }
  return "unknown";
}

export function providerDisplayName(provider: ProviderRecord): string {
  if (provider.name) return provider.name;
  const full = [provider.first_name, provider.last_name].filter(Boolean).join(" ");
  return full || `Provider ${provider.id}`;
}
