/**
 * SoonerCare (SC) production — gross charges flagged by patient carrier or SC chart codes.
 * See docs/FORMULAS_DR_QUESTIONS.md Q6.
 */

import type { CdtLookup } from "@/lib/cdt/categories";
import type { NexPatient } from "@/lib/nexhealth/client";

/** Primary insurance carrier names that count as SoonerCare / Medicaid (OD defaults). */
export const SOONERCARE_CARRIER_PATTERN =
  /\b(sooner\s*care|soonercare|medicaid|ohca|oklahoma\s+medicaid)\b/i;

const CARRIER_STRING_KEYS = [
  "primary_insurance_carrier",
  "primary_insurance_company",
  "primary_carrier",
  "insurance_carrier",
  "insurance_company",
  "carrier_name",
  "primary_insurance_plan_name",
  "insurance_plan_name",
  "primary_insurance",
  "insurance_name",
  "ins_carrier",
  "insurance",
] as const;

const CARRIER_NESTED_KEYS = [
  "primary_insurance",
  "insurance",
  "primaryInsurance",
  "insurance_primary",
] as const;

const CARRIER_NESTED_STRING_KEYS = [
  "carrier",
  "carrier_name",
  "name",
  "company",
  "plan_name",
  "insurance_carrier",
  "insurance_company",
] as const;

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function firstString(
  sources: Record<string, unknown>[],
  keys: readonly string[],
): string | null {
  for (const src of sources) {
    for (const key of keys) {
      const hit = readString(src[key]);
      if (hit) return hit;
    }
  }
  return null;
}

function nestedRecord(
  obj: Record<string, unknown> | undefined,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

/** Best-effort primary carrier from NexHealth patient payload (bio + top-level). */
export function extractPrimaryInsuranceCarrier(
  patient: NexPatient,
): string | null {
  const bio =
    patient.bio && typeof patient.bio === "object"
      ? (patient.bio as Record<string, unknown>)
      : undefined;
  const top = patient as Record<string, unknown>;
  const sources = [bio, top].filter(Boolean) as Record<string, unknown>[];

  const direct = firstString(sources, CARRIER_STRING_KEYS);
  if (direct) return direct;

  for (const src of sources) {
    for (const nestKey of CARRIER_NESTED_KEYS) {
      const nested = nestedRecord(src, [nestKey]);
      if (!nested) continue;
      const name = firstString([nested], CARRIER_NESTED_STRING_KEYS);
      if (name) return name;
    }
  }

  for (const src of sources) {
    const plans = src.insurances ?? src.insurance_plans;
    if (!Array.isArray(plans)) continue;
    for (const item of plans) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const ordinal = rec.ordinal ?? rec.priority ?? rec.type ?? rec.rank;
      const isPrimary =
        ordinal === "primary" ||
        ordinal === "Primary" ||
        ordinal === 1 ||
        plans.length === 1;
      if (!isPrimary) continue;
      const name = firstString([rec], CARRIER_NESTED_STRING_KEYS);
      if (name) return name;
    }
  }

  return null;
}

export function isSoonerCareCarrier(
  carrier: string | null | undefined,
): boolean {
  if (!carrier?.trim()) return false;
  return SOONERCARE_CARRIER_PATTERN.test(carrier);
}

export type PatientCarrierRecord = {
  id: number;
  primaryInsuranceCarrier?: string | null;
};

function carrierFromPatient(
  patient: NexPatient | PatientCarrierRecord,
): string | null {
  if (
    "primaryInsuranceCarrier" in patient &&
    typeof patient.primaryInsuranceCarrier === "string"
  ) {
    return patient.primaryInsuranceCarrier;
  }
  if ("id" in patient && "bio" in patient) {
    return extractPrimaryInsuranceCarrier(patient as NexPatient);
  }
  if (
    "primaryInsuranceCarrier" in patient &&
    patient.primaryInsuranceCarrier === null
  ) {
    return null;
  }
  return extractPrimaryInsuranceCarrier(patient as NexPatient);
}

export function buildSoonerCarePatientSet(
  patients: Array<NexPatient | PatientCarrierRecord>,
): Set<number> {
  const set = new Set<number>();
  for (const patient of patients) {
    if (isSoonerCareCarrier(carrierFromPatient(patient))) {
      set.add(patient.id);
    }
  }
  return set;
}

/** Chart description starts with SC (e.g. "SC Prophy", "SC - Ext"). */
export function isScChartDescription(description: string): boolean {
  const trimmed = description.trim();
  if (!trimmed) return false;
  return /^SC(?:\s|[\s\-/]|$)/i.test(trimmed);
}

export function resolveProcedureDescription(
  code: string,
  overrideName: string,
  cdt: CdtLookup,
): string {
  const trimmed = overrideName.trim();
  if (trimmed && trimmed.toUpperCase() !== code.trim().toUpperCase()) {
    return trimmed;
  }
  return cdt.lookupDescription(code) ?? trimmed;
}

export function isScProductionCharge(params: {
  code: string;
  chargeName: string;
  patientId: number | null | undefined;
  soonerCarePatients: Set<number>;
  cdt: CdtLookup;
}): boolean {
  const description = resolveProcedureDescription(
    params.code,
    params.chargeName,
    params.cdt,
  );

  const warrantyBucket = params.cdt.lookupWarrantyBucket(params.code);
  if (warrantyBucket && !isScChartDescription(description)) {
    return false;
  }

  if (isScChartDescription(description)) return true;

  if (
    typeof params.patientId === "number" &&
    params.soonerCarePatients.has(params.patientId)
  ) {
    return true;
  }

  return false;
}
