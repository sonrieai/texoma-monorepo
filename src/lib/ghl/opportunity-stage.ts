/**
 * Move the patient's existing opportunity to Leads → No-Show/Cancellation.
 * Never create a second card; never move to Consults Today (workflow owns that).
 */

import { ghlFetch, GhlApiError } from "@/lib/ghl/http";
import {
  resolveLeadsNoShowStageId,
  resolveLeadsPipelineId,
} from "@/lib/ghl/funnel-stage-tiers";
import type { GhlConfig } from "@/lib/ghl/types";

type OppHit = { id?: string; pipelineId?: string; pipelineStageId?: string };

export function requireLeadsNoShowStageConfig(): {
  pipelineId: string;
  stageId: string;
} {
  return {
    pipelineId: resolveLeadsPipelineId(),
    stageId: resolveLeadsNoShowStageId(),
  };
}

async function searchOpportunitiesForContact(params: {
  contactId: string;
  config: GhlConfig;
}): Promise<OppHit[]> {
  const q = new URLSearchParams({
    location_id: params.config.locationId,
    contact_id: params.contactId,
    status: "all",
    limit: "20",
  });
  try {
    const data = await ghlFetch<{ opportunities?: OppHit[] }>(
      `/opportunities/search?${q.toString()}`,
      {},
      params.config,
    );
    return data.opportunities ?? [];
  } catch {
    try {
      const data = await ghlFetch<{ opportunities?: OppHit[] }>(
        "/opportunities/search",
        {
          method: "POST",
          body: JSON.stringify({
            locationId: params.config.locationId,
            contactId: params.contactId,
            status: "all",
            limit: 20,
          }),
        },
        params.config,
      );
      return data.opportunities ?? [];
    } catch {
      return [];
    }
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

/** Move existing card to Leads No-Show/Cancellation; do not create opportunities. */
export async function ensureNoShowCancelledOpportunity(params: {
  contactId: string;
  config: GhlConfig;
}): Promise<void> {
  const { pipelineId, stageId } = requireLeadsNoShowStageConfig();
  const hits = await searchOpportunitiesForContact({
    contactId: params.contactId,
    config: params.config,
  });
  const existing = hits.find((h) => h.id);
  if (!existing?.id) return;

  if (
    existing.pipelineId === pipelineId &&
    existing.pipelineStageId === stageId
  ) {
    return;
  }

  try {
    await moveOpportunityStage({
      opportunityId: existing.id,
      pipelineId,
      pipelineStageId: stageId,
      config: params.config,
    });
  } catch (err) {
    if (err instanceof GhlApiError && err.status === 400) {
      console.error(
        `GoHighLevel no-show stage move failed for contact ${params.contactId}: ${err.message}`,
      );
      return;
    }
    throw err;
  }
}
