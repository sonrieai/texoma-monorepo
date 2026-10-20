/**
 * Treatment Coordinator pipeline stage ID → funnel tier (Texoma).
 * From "Showed - Plan Presented" onward counts as at least showed.
 * Unmapped IDs must not default to lead.
 */

export const TEXOMA_TC_PIPELINE_ID = "suRYSJn1pEqxFgVtWPHi";

export type FunnelTier =
  | "lead"
  | "booked"
  | "showed"
  | "accepted"
  | "surgery"
  | "unmapped";

/** Live Texoma TC stages (12). */
export const TC_STAGE_TIER_BY_ID: Readonly<Record<string, FunnelTier>> = {
  // Consult scheduled — not yet showed
  "72627739-9c69-4c05-b823-2cf61aafa34f": "booked", // Consults Today
  // Missed / cancelled: had a booking; without stage history we cannot claim showed
  "b09a8f58-4eb9-4159-a1c3-2869cc408dc0": "booked", // No-Show / Cancelled
  // Showed – Plan Presented and everything after → at least showed
  "45e53c62-cd45-44bf-b8b7-730743304d8a": "showed", // Showed - Plan Presented
  "d78eb0cf-e36a-462a-8cdc-e82a27f108eb": "showed", // Deciding
  "bd447ceb-aab3-4051-8c9a-d6e0f0c0a42a": "showed", // Waiting on Us
  "d271ed3e-8933-40c9-9fec-29119d378bd5": "showed", // Waiting - Financing
  "861d88b3-b142-47c0-a632-ef16fda911d5": "showed", // Waiting - Medical Clearance
  "2f67a00b-8b20-4e0c-9e90-f818aa525025": "showed", // Follow-Up - Call 1 (VM)
  "501edf02-81f9-4362-8aab-9a42efbe8590": "showed", // Follow-Up - Call 2 (VM)
  "e839c706-9e45-4273-87a7-911733abbf3b": "showed", // Follow-Up - Call 3 (VM)
  "e2b50906-c25c-46a1-b080-776410c9d075": "surgery", // Sold - Scheduled
  "4ab530d9-d4c7-49f5-8238-deedd90fdc3a": "surgery", // Long-Term Follow-Up
};

export const TIER_RANK: Record<FunnelTier, number> = {
  unmapped: -1,
  lead: 0,
  booked: 1,
  showed: 2,
  accepted: 3,
  surgery: 4,
};

export function stageTierFromStageId(
  stageId: string | null | undefined,
): FunnelTier {
  const id = (stageId ?? "").trim();
  if (!id) return "unmapped";
  return TC_STAGE_TIER_BY_ID[id] ?? "unmapped";
}

/** Max of two tiers (furthest funnel position reached). */
export function furthestTier(a: FunnelTier, b: FunnelTier): FunnelTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function resolveTcPipelineId(): string {
  return process.env.GHL_TC_PIPELINE_ID?.trim() || TEXOMA_TC_PIPELINE_ID;
}
