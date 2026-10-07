import { inYmdRange } from "@/lib/warehouse/conversion";
import { moneyToCents, type ChargeRecord } from "@/lib/warehouse/types";
import { cityLabel } from "@/lib/warehouse/patient-address";
import type { PeriodRange } from "@/lib/ui/period";

/** Texoma region county count (prototype reference map). */
export const TEXOMA_REGION_COUNTY_COUNT = 10;

/** De-identified geo row (city/state/ZIP only). */
export type PatientCityRow = {
  patientId: number;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function cityFromRow(p: PatientCityRow): string | null {
  return cityLabel({
    addressLine: null,
    city: p.city,
    state: p.state,
    postalCode: p.zip,
    county: null,
    latitude: null,
    longitude: null,
  });
}

/** Map source patient id → city label for charge rollups. */
export function buildPatientCityIndex(
  patients: PatientCityRow[],
): Map<number, string> {
  const out = new Map<number, string>();
  for (const p of patients) {
    const label = cityFromRow(p);
    if (label) out.set(p.patientId, label);
  }
  return out;
}

/** Sum charge production cents by patient city (mapped areas only). */
export function aggregateProductionCentsByCity(
  patients: PatientCityRow[],
  charges: ChargeRecord[],
  range?: PeriodRange,
): Map<string, number> {
  const patientCity = buildPatientCityIndex(patients);
  const byCity = new Map<string, number>();

  for (const charge of charges) {
    if (charge.deleted_at) continue;
    if (
      range &&
      !inYmdRange(charge.charged_at, range.start, range.end)
    ) {
      continue;
    }
    const patientId = charge.patient_id;
    if (patientId == null) continue;
    const city = patientCity.get(patientId);
    if (!city) continue;
    const cents = moneyToCents(charge.fee);
    if (cents <= 0) continue;
    byCity.set(city, (byCity.get(city) ?? 0) + cents);
  }

  return byCity;
}
