/**
 * Procedure volume KPIs — completed procedures only, buckets from Code Chart (Mongo).
 */

import type { CdtLookup, ProcedureVolumeBucket } from "@/lib/cdt/categories";
import { inYmdRange } from "@/lib/nexhealth/conversion";
import { isProcedureComplete } from "@/lib/nexhealth/procedure-status";
import type { NexProcedure } from "@/lib/nexhealth/client";

type VolumeCounts = Record<ProcedureVolumeBucket, number>;

function procedureYmd(proc: NexProcedure): string | null {
  const raw = proc.start_date || proc.end_date || proc.updated_at;
  if (!raw) return null;
  return raw.slice(0, 10);
}

export function filterCompletedProceduresInRange(
  procedures: NexProcedure[],
  fromYmd: string,
  toYmd: string,
): NexProcedure[] {
  return procedures.filter((p) => {
    if (!isProcedureComplete(p.status)) return false;
    const date = procedureYmd(p);
    return date != null && inYmdRange(date, fromYmd, toYmd);
  });
}

/** Count volume buckets from chart-mapped completed procedures (not charges). */
export function accumulateProcedureVolume(params: {
  cdt: CdtLookup;
  procedures: NexProcedure[];
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
