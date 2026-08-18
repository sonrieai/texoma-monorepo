/**
 * NO-ePHI warehouse policy: allowlisted fields only.
 * Strip identifiers before any Mongo write.
 */

import type {
  NexAdjustment,
  NexAppointment,
  NexCharge,
  NexClaim,
  NexGuarantorBalance,
  NexInsuranceBalance,
  NexInsurancePlan,
  NexPatient,
  NexPayment,
  NexProcedure,
  NexTreatmentPlan,
} from "@/lib/nexhealth/client";
import {
  extractPatientAddress,
  indexPatientsByNexId,
  resolvePatientAddress,
} from "@/lib/nexhealth/patient-address";
import { extractPrimaryInsuranceCarrier } from "@/lib/nexhealth/sc-production";

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

function nexNumericId(raw: { id?: number }): number | null {
  return typeof raw.id === "number" ? raw.id : null;
}

/** Extract allowlisted patient index fields. Never returns names/contact/street. */
export function stripPhiFromNexPatient(
  patient: NexPatient,
  byNexId?: Map<number, NexPatient>,
): SlimPatientIndex | null {
  const id = nexNumericId(patient);
  if (id == null) return null;

  const addr = byNexId
    ? resolvePatientAddress(patient, byNexId)
    : extractPatientAddress(patient);

  return {
    patientId: id,
    inactive: Boolean(patient.inactive),
    primaryInsuranceCarrier: extractPrimaryInsuranceCarrier(patient),
    geoCity: addr.city,
    geoState: addr.state,
    geoZip: addr.postalCode,
  };
}

export function slimNexAppointment(raw: NexAppointment): NexAppointment {
  return omitPhiKeys(raw as Record<string, unknown>) as NexAppointment;
}

export function slimNexProcedure(raw: NexProcedure): NexProcedure {
  return omitPhiKeys(raw as Record<string, unknown>) as NexProcedure;
}

export function slimNexCharge(raw: NexCharge): NexCharge {
  return omitPhiKeys(raw as Record<string, unknown>) as NexCharge;
}

export function slimNexPayment(raw: NexPayment): NexPayment {
  const slim = omitPhiKeys(raw as Record<string, unknown>) as NexPayment;
  return { ...slim, notes: null };
}

export function slimNexAdjustment(raw: NexAdjustment): NexAdjustment {
  return omitPhiKeys(raw as Record<string, unknown>) as NexAdjustment;
}

export function slimNexTreatmentPlan(raw: NexTreatmentPlan): NexTreatmentPlan {
  return omitPhiKeys(raw as Record<string, unknown>) as NexTreatmentPlan;
}

export function slimNexClaim(raw: NexClaim): NexClaim {
  const slim = omitPhiKeys(raw as Record<string, unknown>) as NexClaim;
  return { ...slim, note: null };
}

export function slimNexGuarantorBalance(
  raw: NexGuarantorBalance,
): NexGuarantorBalance {
  return omitPhiKeys(raw as Record<string, unknown>) as NexGuarantorBalance;
}

export function slimNexInsuranceBalance(
  raw: NexInsuranceBalance,
): NexInsuranceBalance {
  return omitPhiKeys(raw as Record<string, unknown>) as NexInsuranceBalance;
}

export function slimNexInsurancePlan(raw: NexInsurancePlan): NexInsurancePlan {
  return omitPhiKeys(raw as Record<string, unknown>) as NexInsurancePlan;
}

export function slimWarehouseRaw<T extends Record<string, unknown>>(raw: T): T {
  if (!isPhiStripEnabled()) return omitPhiKeys(raw);
  return omitPhiKeys(raw);
}

export function indexPatientsForPhiStrip(
  rows: NexPatient[],
): Map<number, NexPatient> {
  return indexPatientsByNexId(rows);
}

/** Legacy PHI fields to $unset on existing patient documents. */
export const PATIENT_PHI_UNSET_FIELDS = {
  firstName: "",
  lastName: "",
  email: "",
  raw: "",
} as const;
