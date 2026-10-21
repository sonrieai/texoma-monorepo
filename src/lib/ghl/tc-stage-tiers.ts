/**
 * Treatment Coordinator pipeline stage ID → funnel tier (Texoma).
 * Defaults live in funnel-stage-tiers.ts (Leads + TC).
 */

import {
  DEFAULT_STAGE_TIER_BY_ID,
  TEXOMA_TC_PIPELINE_ID,
} from "@/lib/ghl/funnel-stage-tiers";

export { TEXOMA_TC_PIPELINE_ID };

export type FunnelTier =
  | "lead"
  | "booked"
  | "showed"
  | "accepted"
  | "surgery"
  | "unmapped";

/** TC + Leads stage ids (for marketing funnel). */
export const TC_STAGE_TIER_BY_ID: Readonly<Record<string, FunnelTier>> =
  DEFAULT_STAGE_TIER_BY_ID;

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
