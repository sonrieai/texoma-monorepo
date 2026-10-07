/**
 * Procedure volume KPIs — completed procedures only, buckets from Code Chart (Mongo).
 */

import {
  normalizeProcedureCode,
  type CdtLookup,
  type ProcedureVolumeBucket,
} from "@/lib/cdt/categories";
import { inYmdRange } from "@/lib/warehouse/conversion";
import { isProcedureComplete } from "@/lib/warehouse/procedure-status";
import type { ProcedureRecord } from "@/lib/warehouse/types";

/** Completed denture seats (Formulas tab — not N4120 delivery markers). */
export function isDentureDeliveryProcedureCode(
  code: string | null | undefined,
): boolean {
  const normalized = normalizeProcedureCode(code);
  if (normalized === "UNKNOWN" || normalized.startsWith("N")) return false;
  return /^D5110|^D5120|^D5130|^D5140/.test(normalized);
}

const REMAKE_PROCEDURE_PATTERN =
  /^D551[0-9]|^D5520|^D561[0-9]|^D562[0-9]|^D5630|^D5640|^D5650|^D6090/i;

/** Remake / repair denture procedures (Formulas tab — D5511+ family). */
export function isRemakeProcedureCode(
  code: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const normalized = normalizeProcedureCode(code);
  if (normalized !== "UNKNOWN" && REMAKE_PROCEDURE_PATTERN.test(normalized)) {
    return true;
  }
  const hay = `${code ?? ""} ${description ?? ""}`.trim();
  return /\b(remake|repair broken complete denture|rebase complete)\b/i.test(
    hay,
  );
}

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
    const procName = proc.name?.trim() || "";

    if (isRemakeProcedureCode(code, procName)) {
      params.volume.remakes += 1;
      if (params.onProviderVolume && proc.provider_id != null) {
        params.onProviderVolume(proc.provider_id, "remakes");
      }
      continue;
    }

    const bucket: ProcedureVolumeBucket | null = params.cdt.volumeBucket(code);
    if (!bucket) continue;
    if (bucket === "aox" && !params.cdt.isAoxSoldCode(code)) continue;
    if (bucket === "dentures" && !isDentureDeliveryProcedureCode(code)) {
      continue;
    }
    params.volume[bucket] += 1;
    if (params.onProviderVolume && proc.provider_id != null) {
      params.onProviderVolume(proc.provider_id, bucket);
    }
  }
}
