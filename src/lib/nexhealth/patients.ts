import type { NexPatient } from "@/lib/nexhealth/client";
import {
  extractPatientAddress,
  indexPatientsByNexId,
  resolvePatientAddress,
  type PatientAddress,
} from "@/lib/nexhealth/patient-address";

export type { PatientAddress };

/** Display row for Patients tab (PHI — keep off analytics/export APIs). */
export type PatientDirectoryRow = PatientAddress & {
  id: string;
  nexId: number;
  name: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  inactive: boolean;
  foreignId: string | null;
};

const PHONE_BIO_KEYS = [
  "phone_number",
  "phone",
  "cell_phone_number",
  "cell_phone",
  "mobile_phone",
  "wireless_phone",
  "home_phone_number",
  "home_phone",
  "hm_phone",
  "work_phone_number",
  "work_phone",
] as const;

function bioString(
  bio: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | null {
  if (!bio) return null;
  for (const key of keys) {
    const value = bio[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function mapPatientDirectoryRow(
  p: NexPatient,
  address?: PatientAddress,
): PatientDirectoryRow {
  const bio = p.bio && typeof p.bio === "object" ? p.bio : undefined;
  const addr = address ?? extractPatientAddress(p);

  const first = typeof p.first_name === "string" ? p.first_name.trim() : "";
  const last = typeof p.last_name === "string" ? p.last_name.trim() : "";
  const name =
    [first, last].filter(Boolean).join(" ") ||
    bioString(bio, ["full_name", "name"]) ||
    `Patient ${p.id}`;

  const email =
    (typeof p.email === "string" && p.email.trim()) ||
    bioString(bio, ["email", "email_address"]) ||
    null;

  const phone = bioString(bio, PHONE_BIO_KEYS);

  const dateOfBirth = bioString(bio, [
    "date_of_birth",
    "dob",
    "birth_date",
    "birthdate",
  ]);

  return {
    id: String(p.id),
    nexId: p.id,
    name,
    email,
    phone,
    dateOfBirth,
    ...addr,
    inactive: Boolean(p.inactive),
    foreignId:
      typeof p.foreign_id === "string" && p.foreign_id.trim()
        ? p.foreign_id.trim()
        : null,
  };
}

/** Map warehouse patients with guarantor address fallback for dependents. */
export function mapPatientDirectoryRows(
  patients: NexPatient[],
): PatientDirectoryRow[] {
  const byNexId = indexPatientsByNexId(patients);
  return patients.map((p) =>
    mapPatientDirectoryRow(p, resolvePatientAddress(p, byNexId)),
  );
}
