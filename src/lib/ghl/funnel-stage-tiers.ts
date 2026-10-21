/**
 * Pipeline stage id → funnel tier (Texoma). IDs survive renames in GoHighLevel.
 * Settings override via env JSON later; defaults match Change Spec 20 Oct 2026.
 */

import type { FunnelTier } from "@/lib/ghl/tc-stage-tiers";

export const TEXOMA_LEADS_PIPELINE_ID = "nk8ZbJEWH0dk62iUGwc8";
export const TEXOMA_TC_PIPELINE_ID = "suRYSJn1pEqxFgVtWPHi";
/** Retired — never select for dashboard funnel reads. */
export const TEXOMA_CALL_CENTER_PIPELINE_ID = "TnPzQVrOCuK4PBb4mFZo";

export const LEADS_FAKE_LEAD_STAGE_ID =
  "70b5061b-5de3-4b30-9302-bd279e0e9263";

export const LEADS_NO_SHOW_CANCELLATION_STAGE_ID =
  "ce2067f3-7e1a-4293-b476-e7b4834bc307";

/** Default stage → tier for Leads + TC pipelines. */
export const DEFAULT_STAGE_TIER_BY_ID: Readonly<Record<string, FunnelTier>> = {
  // Treatment Coordinator
  "13ea8084-0335-43e4-b6ac-51a06bfef500": "booked", // Consult Booked
  "72627739-9c69-4c05-b823-2cf61aafa34f": "booked", // Consults Today
  "45e53c62-cd45-44bf-b8b7-730743304d8a": "showed",
  "d78eb0cf-e36a-462a-8cdc-e82a27f108eb": "showed",
  "bd447ceb-aab3-4051-8c9a-d6e0f0c0a42a": "showed",
  "d271ed3e-8933-40c9-9fec-29119d378bd5": "showed",
  "861d88b3-b142-47c0-a632-ef16fda911d5": "showed",
  "2f67a00b-8b20-4e0c-9e90-f818aa525025": "showed",
  "501edf02-81f9-4362-8aab-9a42efbe8590": "showed",
  "e839c706-9e45-4273-87a7-911733abbf3b": "showed",
  "e2b50906-c25c-46a1-b080-776410c9d075": "accepted", // Sold – Scheduled
  "4ab530d9-d4c7-49f5-8238-deedd90fdc3a": "showed", // Long-Term Follow-Up
  // Leads Pipeline (early funnel)
  "3393ebc1-e9e5-497d-a5f3-162963126fa3": "lead",
  "865b5630-fe78-48f1-81e9-2cbff4b2df92": "lead",
  "f901ca3d-34ff-4165-a343-ac3db157a49b": "lead",
  "b314570a-fa39-42ea-9253-30858041c32a": "lead",
  "ea057a51-afff-425e-bfdf-8c96bca7da2d": "lead",
  "d907a7ba-a961-476c-9ad8-277eaf162756": "lead",
  "2266a0bb-4c00-404c-9bbc-52a2751e8c61": "lead",
  "2bd5f520-7d79-4e3b-a7a3-dfc99d34c06a": "lead",
  [LEADS_NO_SHOW_CANCELLATION_STAGE_ID]: "booked",
  "ee06c615-caaa-4c56-84fa-834c32da4c16": "booked",
  "6241f807-17a9-4ee0-983c-6a3f3b06a3df": "booked",
  "5092715e-838c-4d4a-9a51-9113015911ac": "lead",
};

export function resolveLeadsPipelineId(): string {
  return process.env.GHL_LEADS_PIPELINE_ID?.trim() || TEXOMA_LEADS_PIPELINE_ID;
}

export function resolveLeadsNoShowStageId(): string {
  return (
    process.env.GHL_LEADS_NO_SHOW_STAGE_ID?.trim() ||
    LEADS_NO_SHOW_CANCELLATION_STAGE_ID
  );
}

export function stageTierFromConfiguredId(
  stageId: string | null | undefined,
  tierMap: Readonly<Record<string, FunnelTier>> = DEFAULT_STAGE_TIER_BY_ID,
): FunnelTier {
  const id = (stageId ?? "").trim();
  if (!id) return "unmapped";
  if (id === LEADS_FAKE_LEAD_STAGE_ID) return "unmapped";
  return tierMap[id] ?? "unmapped";
}

export function isExcludedFakeLeadStage(stageId: string | null | undefined): boolean {
  return (stageId ?? "").trim() === LEADS_FAKE_LEAD_STAGE_ID;
}
