/**
 * NO-ePHI warehouse policy: allowlisted fields only.
 * Strip identifiers before any Mongo write.
 */

import type {
  AdjustmentRecord,
  AppointmentRecord,
  ChargeRecord,
  ClaimRecord,
  GuarantorBalanceRecord,
  InsuranceBalanceRecord,
  InsurancePlanRecord,
  PatientRecord,
  PaymentRecord,
  ProcedureRecord,
  TreatmentPlanRecord,
} from "@/lib/warehouse/types";
import {
  extractPatientAddress,
  indexPatientsBySourceId,
  resolvePatientAddress,
} from "@/lib/warehouse/patient-address";
import { extractPrimaryInsuranceCarrier } from "@/lib/warehouse/sc-production";
import { extractDeclineReasonLabel } from "@/lib/tc/decline-reasons";

/** Default on. Set SYNC_STRIP_PHI=0 only for local debugging of unsanitized payloads. */
export function isPhiStripEnabled(): boolean {
  const flag = process.env.SYNC_STRIP_PHI?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return true;
}

export const PHI_FIELD_KEYS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "phone_number",
  "home_phone_number",
  "work_phone_number",
  "cell_phone",
  "mobile",
  "ssn",
  "social_security",
  "date_of_birth",
  "dob",
  "birth_date",
  "address",
  "address_line_1",
  "address_line_2",
  "address_line1",
  "address_line2",
  "street",
  "street_address",
  "address1",
  "addr1",
  "bio",
  "notes",
  "note",
  "patient_name",
  "chart_notes",
] as const;

const PHI_KEY_SET = new Set<string>(PHI_FIELD_KEYS);

export type SlimPatientIndex = {
  patientId: number;
  inactive: boolean;
  primaryInsuranceCarrier: string | null;
  geoCity: string | null;
  geoState: string | null;
  geoZip: string | null;
  /** Open Dental patient.DateFirstVisit (YYYY-MM-DD). Not a name or address. */
  dateFirstVisit: string | null;
};

export function omitPhiKeys<T extends Record<string, unknown>>(raw: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (PHI_KEY_SET.has(key)) continue;
    if (key === "patient" && value && typeof value === "object") continue;
    out[key] = value;
  }
  return out as T;
}

export function containsPhiKeys(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (PHI_KEY_SET.has(key)) return true;
  }
  return false;
}

function sourceNumericId(raw: { id?: number }): number | null {
  return typeof raw.id === "number" ? raw.id : null;
}

/** Extract allowlisted patient index fields. Never returns names/contact/street. */
export function stripPhiFromPatientRecord(
  patient: PatientRecord,
  bySourceId?: Map<number, PatientRecord>,
): SlimPatientIndex | null {
  const id = sourceNumericId(patient);
  if (id == null) return null;

  const addr = bySourceId
    ? resolvePatientAddress(patient, bySourceId)
    : extractPatientAddress(patient);

  return {
    patientId: id,
    inactive: Boolean(patient.inactive),
    primaryInsuranceCarrier: extractPrimaryInsuranceCarrier(patient),
    geoCity: addr.city,
    geoState: addr.state,
    geoZip: addr.postalCode,
    dateFirstVisit: null,
  };
}

export function slimAppointmentRecord(raw: AppointmentRecord): AppointmentRecord {
  return omitPhiKeys(raw as Record<string, unknown>) as AppointmentRecord;
}

export function slimProcedureRecord(raw: ProcedureRecord): ProcedureRecord {
  return omitPhiKeys(raw as Record<string, unknown>) as ProcedureRecord;
}

export function slimChargeRecord(raw: ChargeRecord): ChargeRecord {
  return omitPhiKeys(raw as Record<string, unknown>) as ChargeRecord;
}

export function slimPaymentRecord(raw: PaymentRecord): PaymentRecord {
  const slim = omitPhiKeys(raw as Record<string, unknown>) as PaymentRecord;
  return { ...slim, notes: null };
}

export function slimAdjustmentRecord(raw: AdjustmentRecord): AdjustmentRecord {
  return omitPhiKeys(raw as Record<string, unknown>) as AdjustmentRecord;
}

export function slimTreatmentPlanRecord(raw: TreatmentPlanRecord): TreatmentPlanRecord {
  const declineReason = extractDeclineReasonLabel(
    raw as Record<string, unknown>,
  );
  const slim = omitPhiKeys(raw as Record<string, unknown>) as TreatmentPlanRecord;
  if (declineReason) {
    (slim as Record<string, unknown>).decline_reason = declineReason;
  }
  return slim;
}

export function slimClaimRecord(raw: ClaimRecord): ClaimRecord {
  const slim = omitPhiKeys(raw as Record<string, unknown>) as ClaimRecord;
  return { ...slim, note: null };
}

export function slimGuarantorBalanceRecord(
  raw: GuarantorBalanceRecord,
): GuarantorBalanceRecord {
  return omitPhiKeys(raw as Record<string, unknown>) as GuarantorBalanceRecord;
}

export function slimInsuranceBalanceRecord(
  raw: InsuranceBalanceRecord,
): InsuranceBalanceRecord {
  return omitPhiKeys(raw as Record<string, unknown>) as InsuranceBalanceRecord;
}

export function slimInsurancePlanRecord(raw: InsurancePlanRecord): InsurancePlanRecord {
  return omitPhiKeys(raw as Record<string, unknown>) as InsurancePlanRecord;
}

export function slimWarehouseRaw<T extends Record<string, unknown>>(raw: T): T {
  if (!isPhiStripEnabled()) return omitPhiKeys(raw);
  return omitPhiKeys(raw);
}

export function indexPatientsForPhiStrip(
  rows: PatientRecord[],
): Map<number, PatientRecord> {
  return indexPatientsBySourceId(rows);
}

/** Legacy PHI fields to $unset on existing patient documents. */
export const PATIENT_PHI_UNSET_FIELDS = {
  firstName: "",
  lastName: "",
  email: "",
  raw: "",
} as const;
