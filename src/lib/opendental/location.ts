/** Display location helpers for Open Dental live reads. */

export function getWarehouseLocationId(): number {
  const warehouse = process.env.WAREHOUSE_LOCATION_ID?.trim();
  if (warehouse) {
    const n = Number.parseInt(warehouse, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

export function getWarehouseSubdomain(): string {
  return process.env.WAREHOUSE_SUBDOMAIN?.trim() || "opendental-local";
}

export function getWarehouseLocationName(): string | null {
  return process.env.WAREHOUSE_LOCATION_NAME?.trim() || null;
}

/** Optional clinic filter: OD_CLINIC_NUMS=1,2 */
export function getOdClinicNums(): number[] | undefined {
  const raw = process.env.OD_CLINIC_NUMS?.trim();
  if (!raw) return undefined;
  const nums = raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return nums.length ? nums : undefined;
}
