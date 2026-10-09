/**
 * Open Dental placeholder providers used for office and line-of-business
 * production. They are not clinicians and should not appear as doctors.
 */
const EXCLUDED_DOCTOR_PROVIDER_KEYS = new Set([
  "OFFICE",
  "DENT",
  "SNAP-IN",
  "FIXED",
]);

export function doctorProviderKey(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export function isExcludedDoctorProvider(name: string): boolean {
  return EXCLUDED_DOCTOR_PROVIDER_KEYS.has(doctorProviderKey(name));
}
