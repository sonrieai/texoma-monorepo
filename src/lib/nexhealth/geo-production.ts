import { nexPriceToCents, type NexCharge } from "@/lib/nexhealth/client";
import { cityLabel } from "@/lib/nexhealth/patient-address";
import type { PatientDirectoryRow } from "@/lib/nexhealth/patients";

/** Texoma region county count (prototype reference map). */
export const TEXOMA_REGION_COUNTY_COUNT = 10;

/** Map NexHealth patient id → city label for charge rollups. */
export function buildPatientCityIndex(
  patients: PatientDirectoryRow[],
): Map<number, string> {
  const out = new Map<number, string>();
  for (const p of patients) {
    const label = cityLabel(p);
    if (label) out.set(p.nexId, label);
  }
  return out;
}

/** Sum charge production cents by patient city (mapped areas only). */
export function aggregateProductionCentsByCity(
  patients: PatientDirectoryRow[],
  charges: NexCharge[],
): Map<string, number> {
  const patientCity = buildPatientCityIndex(patients);
  const byCity = new Map<string, number>();

  for (const charge of charges) {
    if (charge.deleted_at) continue;
    const patientId = charge.patient_id;
    if (patientId == null) continue;
    const city = patientCity.get(patientId);
    if (!city) continue;
    const cents = nexPriceToCents(charge.fee);
    if (cents <= 0) continue;
    byCity.set(city, (byCity.get(city) ?? 0) + cents);
  }

  return byCity;
}
