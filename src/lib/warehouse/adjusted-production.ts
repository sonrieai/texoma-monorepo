/**
 * Adjusted production — gross minus write-off AdjTypes from synced source data.
 * Types flagged via `includeInAdjustedProduction` on Mongo `adjustment_types`
 * (default: source action === credit, matching OD production credits).
 */

import { moneyToCents, type AdjustmentRecord } from "@/lib/warehouse/types";

export type AdjustmentTypeRecord = {
  id: number;
  name: string;
  /** When true, adjustments of this type reduce gross production (write-offs). */
  includeInAdjustedProduction: boolean;
};

export function defaultIncludeInAdjustedProduction(
  action: string | null | undefined,
): boolean {
  return (action ?? "").trim().toLowerCase() === "credit";
}

function readAdjustmentTypeId(raw: AdjustmentRecord): number | null {
  const id = raw.adjustment_type_id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export function isWriteOffAdjustment(
  adjustment: AdjustmentRecord,
  typesById: Map<number, AdjustmentTypeRecord>,
): boolean {
  const typeId = readAdjustmentTypeId(adjustment);
  if (typeId == null) return false;
  return typesById.get(typeId)?.includeInAdjustedProduction === true;
}

export function buildAdjustmentTypeMap(
  rows: AdjustmentTypeRecord[],
): Map<number, AdjustmentTypeRecord> {
  const map = new Map<number, AdjustmentTypeRecord>();
  for (const row of rows) {
    if (Number.isFinite(row.id)) map.set(row.id, row);
  }
  return map;
}

export function adjustmentTypeRecordsFromDocs(
  docs: Array<{
    sourceId: number;
    name: string;
    includeInAdjustedProduction: boolean;
  }>,
): AdjustmentTypeRecord[] {
  return docs.map((d) => ({
    id: d.sourceId,
    name: d.name,
    includeInAdjustedProduction: d.includeInAdjustedProduction,
  }));
}

export function sumWriteOffAdjustmentsCents(
  adjustments: AdjustmentRecord[],
  typesById: Map<number, AdjustmentTypeRecord>,
): { cents: number; matchedCount: number; typesAvailable: boolean } {
  const typesAvailable = typesById.size > 0;
  let cents = 0;
  let matchedCount = 0;
  for (const row of adjustments) {
    if (row.deleted_at) continue;
    if (!isWriteOffAdjustment(row, typesById)) continue;
    cents += Math.abs(moneyToCents(row.adjustment_amount));
    matchedCount += 1;
  }
  return { cents, matchedCount, typesAvailable };
}
