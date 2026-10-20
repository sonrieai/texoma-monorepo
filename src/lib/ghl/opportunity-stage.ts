/**
 * Thin TC pipeline helpers: find opportunity by contact, move stage.
 * WF-11/12/13 fire when a card enters No-Show / Cancelled — not from GHL appointments.
 */

import { ghlFetch, GhlApiError } from "@/lib/ghl/http";
import type { GhlConfig } from "@/lib/ghl/types";

/** Consults Today stage (field-driven workflow fills from od_consult_date). */
export const TC_STAGE_CONSULTS_TODAY =
  process.env.GHL_TC_CONSULTS_TODAY_STAGE_ID?.trim() ||
  "72627739-9c69-4c05-b823-2cf61aafa34f";

/** No-Show / Cancelled — triggers miss follow-up workflows. */
export const TC_STAGE_NO_SHOW_CANCELLED =
  process.env.GHL_TC_NO_SHOW_CANCELLED_STAGE_ID?.trim() ||
  "b09a8f58-4eb9-4159-a1c3-2869cc408dc0";

type OppHit = { id?: string; pipelineId?: string; pipelineStageId?: string };

export async function findOpportunityForContact(params: {
  contactId: string;
  pipelineId: string;
  config: GhlConfig;
}): Promise<OppHit | null> {
  const q = new URLSearchParams({
    location_id: params.config.locationId,
    pipeline_id: params.pipelineId,
    contact_id: params.contactId,
    status: "all",
    limit: "5",
  });
  try {
    const data = await ghlFetch<{ opportunities?: OppHit[] }>(
      `/opportunities/search?${q.toString()}`,
      {},
      params.config,
    );
    const hit = data.opportunities?.[0];
    if (hit?.id) return hit;
  } catch {
    // Fall through to POST body search.
  }
  try {
    const data = await ghlFetch<{ opportunities?: OppHit[] }>(
      "/opportunities/search",
      {
        method: "POST",
        body: JSON.stringify({
          locationId: params.config.locationId,
          pipelineId: params.pipelineId,
          contactId: params.contactId,
          status: "all",
          limit: 5,
        }),
      },
      params.config,
    );
    return data.opportunities?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function moveOpportunityStage(params: {
  opportunityId: string;
  pipelineId: string;
  pipelineStageId: string;
  config: GhlConfig;
}): Promise<void> {
  await ghlFetch(
    `/opportunities/${encodeURIComponent(params.opportunityId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        pipelineId: params.pipelineId,
        pipelineStageId: params.pipelineStageId,
      }),
    },
    params.config,
  );
}

export async function createOpportunityAtStage(params: {
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  name: string;
  config: GhlConfig;
}): Promise<string | null> {
  const data = await ghlFetch<{ opportunity?: { id?: string }; id?: string }>(
    "/opportunities/",
    {
      method: "POST",
      body: JSON.stringify({
        locationId: params.config.locationId,
        contactId: params.contactId,
        pipelineId: params.pipelineId,
        pipelineStageId: params.pipelineStageId,
        name: params.name,
        status: "open",
      }),
    },
    params.config,
  );
  return data.opportunity?.id ?? data.id ?? null;
}

/** Move existing TC opportunity to No-Show/Cancelled, or create one there. */
export async function ensureNoShowCancelledOpportunity(params: {
  contactId: string;
  contactName: string;
  config: GhlConfig;
}): Promise<void> {
  const pipelineId = process.env.GHL_TC_PIPELINE_ID?.trim();
  if (!pipelineId) return;

  const existing = await findOpportunityForContact({
    contactId: params.contactId,
    pipelineId,
    config: params.config,
  });
  if (existing?.id) {
    if (existing.pipelineStageId === TC_STAGE_NO_SHOW_CANCELLED) return;
    await moveOpportunityStage({
      opportunityId: existing.id,
      pipelineId,
      pipelineStageId: TC_STAGE_NO_SHOW_CANCELLED,
      config: params.config,
    });
    return;
  }
  try {
    await createOpportunityAtStage({
      contactId: params.contactId,
      pipelineId,
      pipelineStageId: TC_STAGE_NO_SHOW_CANCELLED,
      name: params.contactName || "OD patient",
      config: params.config,
    });
  } catch (err) {
    // GHL allows one open opportunity per contact/pipeline — already there is fine.
    if (
      err instanceof GhlApiError &&
      err.status === 400 &&
      /duplicate opportunity/i.test(err.message)
    ) {
      return;
    }
    throw err;
  }
}
