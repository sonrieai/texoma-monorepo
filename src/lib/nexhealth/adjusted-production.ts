/**
 * Adjusted production — gross minus write-off AdjTypes from synced NexHealth data.
 * Types flagged via `includeInAdjustedProduction` on Mongo `adjustment_types`
 * (default: NexHealth action === credit, matching OD production credits).
 */

import { nexPriceToCents, type NexAdjustment } from "@/lib/nexhealth/client";

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

function readAdjustmentTypeId(raw: NexAdjustment): number | null {
  const id = raw.adjustment_type_id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export function isWriteOffAdjustment(
  adjustment: NexAdjustment,
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
    nexhealthId: number;
    name: string;
    includeInAdjustedProduction: boolean;
  }>,
): AdjustmentTypeRecord[] {
  return docs.map((d) => ({
    id: d.nexhealthId,
    name: d.name,
    includeInAdjustedProduction: d.includeInAdjustedProduction,
  }));
}

export function sumWriteOffAdjustmentsCents(
  adjustments: NexAdjustment[],
  typesById: Map<number, AdjustmentTypeRecord>,
): { cents: number; matchedCount: number; typesAvailable: boolean } {
  const typesAvailable = typesById.size > 0;
  let cents = 0;
  let matchedCount = 0;
  for (const row of adjustments) {
    if (row.deleted_at) continue;
    if (!isWriteOffAdjustment(row, typesById)) continue;
    cents += Math.abs(nexPriceToCents(row.adjustment_amount));
    matchedCount += 1;
  }
  return { cents, matchedCount, typesAvailable };
}
