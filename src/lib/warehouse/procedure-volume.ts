/**
 * Procedure volume KPIs — completed procedures only, buckets from Code Chart (Mongo).
 */

import type { CdtLookup, ProcedureVolumeBucket } from "@/lib/cdt/categories";
import { inYmdRange } from "@/lib/warehouse/conversion";
import { isProcedureComplete } from "@/lib/warehouse/procedure-status";
import type { ProcedureRecord } from "@/lib/warehouse/types";

type VolumeCounts = Record<ProcedureVolumeBucket, number>;

function procedureYmd(proc: ProcedureRecord): string | null {
  const raw = proc.start_date || proc.end_date || proc.updated_at;
  if (!raw) return null;
  return raw.slice(0, 10);
}

export function filterCompletedProceduresInRange(
  procedures: ProcedureRecord[],
  fromYmd: string,
  toYmd: string,
): ProcedureRecord[] {
  return procedures.filter((p) => {
    if (!isProcedureComplete(p.status)) return false;
    const date = procedureYmd(p);
    return date != null && inYmdRange(date, fromYmd, toYmd);
  });
}

/** Count volume buckets from chart-mapped completed procedures (not charges). */
export function accumulateProcedureVolume(params: {
  cdt: CdtLookup;
  procedures: ProcedureRecord[];
  fromYmd: string;
  toYmd: string;
  volume: VolumeCounts;
  onProviderVolume?: (
    providerId: number,
    bucket: ProcedureVolumeBucket,
  ) => void;
}): void {
  for (const proc of filterCompletedProceduresInRange(
    params.procedures,
    params.fromYmd,
    params.toYmd,
  )) {
    const code = (proc.code || "").trim();
    if (!code) continue;
    const bucket: ProcedureVolumeBucket | null = params.cdt.volumeBucket(code);
    if (!bucket) continue;
    params.volume[bucket] += 1;
    if (params.onProviderVolume && proc.provider_id != null) {
      params.onProviderVolume(proc.provider_id, bucket);
    }
  }
}
