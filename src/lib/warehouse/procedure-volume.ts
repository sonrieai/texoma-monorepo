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

/** Tooth extraction CDT codes. Alveoloplasty (D73xx) is not an extraction. */
const EXTRACTION_PROCEDURE_PATTERN =
  /^D7140|^D7210|^D7220|^D7230|^D7240|^D7241|^D7250/;

/** Implant placement codes. Crowns and abutments are not placements. */
const IMPLANT_PLACEMENT_PATTERN = /^D6010|^D6011|^D6040|^D6050/;

/** Partial denture CDT range (D5211–D5286, including office suffixes). */
const PARTIAL_PROCEDURE_PATTERN = /^D521[1-4]|^D522[1-6]|^D528/;

const AOX_TEXT_PATTERN = /\ball[\s-]?on|\baox\b/i;

export function isExtractionProcedureCode(
  code: string | null | undefined,
): boolean {
  const normalized = normalizeProcedureCode(code);
  if (normalized === "UNKNOWN" || normalized.startsWith("N")) return false;
  return EXTRACTION_PROCEDURE_PATTERN.test(normalized);
}

export function isImplantPlacementProcedureCode(
  code: string | null | undefined,
): boolean {
  const normalized = normalizeProcedureCode(code);
  if (normalized === "UNKNOWN" || normalized.startsWith("N")) return false;
  return IMPLANT_PLACEMENT_PATTERN.test(normalized);
}

export function isPartialProcedureCode(
  code: string | null | undefined,
): boolean {
  const normalized = normalizeProcedureCode(code);
  if (normalized === "UNKNOWN" || normalized.startsWith("N")) return false;
  return PARTIAL_PROCEDURE_PATTERN.test(normalized);
}

export function isAoxProcedure(
  code: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const normalized = normalizeProcedureCode(code);
  if (normalized !== "UNKNOWN" && AOX_TEXT_PATTERN.test(normalized)) return true;
  return AOX_TEXT_PATTERN.test(`${code ?? ""} ${description ?? ""}`);
}

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

/** CDT code decides the cockpit count. Description text is only a fallback for all-on cases. */
function volumeBucketFromProcedureCode(
  code: string,
  description: string,
): ProcedureVolumeBucket | null {
  if (isRemakeProcedureCode(code, description)) return "remakes";
  if (isDentureDeliveryProcedureCode(code)) return "dentures";
  if (isPartialProcedureCode(code)) return "partials";
  if (isImplantPlacementProcedureCode(code)) return "implants";
  if (isExtractionProcedureCode(code)) return "extractions";
  if (isAoxProcedure(code, description)) return "aox";
  return null;
}

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

    const codedBucket = volumeBucketFromProcedureCode(code, procName);
    const bucket: ProcedureVolumeBucket | null =
      codedBucket ??
      (params.cdt.volumeBucket(code) === "aox" || params.cdt.isAoxCode(code)
        ? "aox"
        : null);
    if (!bucket) continue;
    params.volume[bucket] += 1;
    if (params.onProviderVolume && proc.provider_id != null) {
      params.onProviderVolume(proc.provider_id, bucket);
    }
  }
}
