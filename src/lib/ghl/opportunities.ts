/**
 * Shared GoHighLevel opportunity fetch for marketing + TC decline charts.
 * One download per request is reused by every caller, and pipelines load together.
 */

import { cache } from "react";
import { getGhlConfig, isGhlConfigured } from "@/lib/ghl/config";
import { ghlFetch } from "@/lib/ghl/http";
import type { GhlConfig } from "@/lib/ghl/types";
import type { MarketingRange } from "@/lib/ghl/marketing";
import {
  resolveLeadsPipelineId,
  TEXOMA_CALL_CENTER_PIPELINE_ID,
} from "@/lib/ghl/funnel-stage-tiers";
import { resolveTcPipelineId } from "@/lib/ghl/tc-stage-tiers";
import { opportunityBelongsToCoordinator } from "@/lib/tc/ghl-attribution";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";

const MAX_PAGES_PER_PIPELINE = 20;
const PAGE_SIZE = 100;
const LOOKBACK_DAYS = 90;
const OPPORTUNITY_CACHE_MS = 2 * 60 * 1000;

type OpportunityCache = Map<
  string,
  { at: number; rows: GhlOpportunityContext[] }
>;
const opportunityCache: OpportunityCache = ((
  globalThis as { __texomaGhlOpportunities?: OpportunityCache }
).__texomaGhlOpportunities ??= new Map());

type GhlPipelineStage = { id: string; name?: string; position?: number };
type GhlPipeline = {
  id: string;
  name?: string;
  stages?: GhlPipelineStage[];
};

export type GhlOpportunity = {
  id: string;
  contactId?: string | null;
  monetaryValue?: number | null;
  pipelineId?: string;
  pipelineStageId?: string;
  status?: string;
  source?: string | null;
  createdAt?: string;
  assignedTo?: string | null;
  assigned_to?: string | null;
  assignedUserId?: string | null;
  assigned_to_user_id?: string | null;
  assignedToId?: string | null;
  userId?: string | null;
  user?: { id?: string; name?: string | null } | null;
  assignedUser?: { id?: string; name?: string | null } | null;
  attributions?: {
    utmSessionSource?: string | null;
    utmSource?: string | null;
    utmCampaign?: string | null;
    utmMedium?: string | null;
    campaign?: string | null;
    medium?: string | null;
    isFirst?: boolean;
  }[];
};

export type GhlOpportunityContext = {
  opp: GhlOpportunity;
  stageName: string;
  pipelineName: string;
  pipelineId: string;
};

function formatMmDdYyyy(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function lookbackStartDate(days = LOOKBACK_DAYS): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return formatMmDdYyyy(d);
}

function ymdToMmDdYyyy(ymd: string): string {
  const [yyyy, mm, dd] = ymd.split("-");
  return `${mm}-${dd}-${yyyy}`;
}

function oppCreatedYmd(opp: GhlOpportunity): string | null {
  return opp.createdAt?.slice(0, 10) ?? null;
}

function oppInRange(
  opp: GhlOpportunity,
  startYmd: string,
  endYmd: string,
): boolean {
  const created = oppCreatedYmd(opp);
  if (!created) return true;
  return created >= startYmd && created <= endYmd;
}

/** Leads + Treatment Coordinator pipelines only (by id, never by name). */
function selectPipelinesForFunnel(pipelines: GhlPipeline[]): GhlPipeline[] {
  const leadsId = resolveLeadsPipelineId();
  const tcId = resolveTcPipelineId();
  const wanted = new Set([leadsId, tcId]);
  return pipelines.filter(
    (p) => wanted.has(p.id) && p.id !== TEXOMA_CALL_CENTER_PIPELINE_ID,
  );
}

async function listPipelines(config: GhlConfig): Promise<GhlPipeline[]> {
  const data = await ghlFetch<{ pipelines?: GhlPipeline[] }>(
    `/opportunities/pipelines?locationId=${encodeURIComponent(config.locationId)}`,
    {},
    config,
  );
  return data.pipelines ?? [];
}

function slimGhlOpportunity(
  raw: GhlOpportunity & { contact?: { id?: string | null } },
): GhlOpportunity {
  const contactId =
    (typeof raw.contactId === "string" && raw.contactId.trim()) ||
    raw.contact?.id?.trim() ||
    null;
  const rest = { ...raw, contactId };
  delete (rest as { contact?: unknown }).contact;
  delete (rest as { name?: unknown }).name;
  return rest;
}

async function listOpportunitiesForPipeline(
  config: GhlConfig,
  pipelineId: string,
  sinceMmDdYyyy: string,
): Promise<GhlOpportunity[]> {
  const out: GhlOpportunity[] = [];
  let startAfter: string | undefined;
  let startAfterId: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_PIPELINE; page += 1) {
    const params = new URLSearchParams({
      location_id: config.locationId,
      pipeline_id: pipelineId,
      status: "all",
      limit: String(PAGE_SIZE),
      date: sinceMmDdYyyy,
      order: "added_desc",
    });
    if (startAfter) params.set("startAfter", startAfter);
    if (startAfterId) params.set("startAfterId", startAfterId);

    const data = await ghlFetch<{
      opportunities?: GhlOpportunity[];
      meta?: {
        nextPage?: number | null;
        startAfter?: number | string;
        startAfterId?: string;
      };
    }>(`/opportunities/search?${params.toString()}`, {}, config);

    const batch = (data.opportunities ?? []).map(slimGhlOpportunity);
    out.push(...batch);
    if (batch.length < PAGE_SIZE || !data.meta?.nextPage) break;
    startAfter =
      data.meta.startAfter != null ? String(data.meta.startAfter) : undefined;
    startAfterId = data.meta.startAfterId;
    if (!startAfter || !startAfterId) break;
  }

  return out;
}

const loadOpportunityContexts = cache(
  async (startYmd: string, endYmd: string): Promise<GhlOpportunityContext[]> => {
    const cacheKey = `${startYmd}|${endYmd}`;
    const cached = opportunityCache.get(cacheKey);
    if (cached && Date.now() - cached.at < OPPORTUNITY_CACHE_MS) {
      return cached.rows;
    }

    if (!(await isGhlConfigured())) return [];

    const cfg = await getGhlConfig();
    const since = startYmd ? ymdToMmDdYyyy(startYmd) : lookbackStartDate();
    const pipelines = await listPipelines(cfg);
    if (pipelines.length === 0) return [];

    const stageNameById = new Map<string, string>();
    for (const pipeline of pipelines) {
      for (const stage of pipeline.stages ?? []) {
        if (stage.id) stageNameById.set(stage.id, stage.name ?? "");
      }
    }

    const selected = selectPipelinesForFunnel(pipelines);
    const batches = await Promise.all(
      selected.map(async (pipeline) => ({
        pipeline,
        opps: await listOpportunitiesForPipeline(cfg, pipeline.id, since),
      })),
    );

    const seenOpp = new Set<string>();
    const out: GhlOpportunityContext[] = [];
    for (const { pipeline, opps } of batches) {
      for (const opp of opps) {
        if (seenOpp.has(opp.id)) continue;
        if (startYmd && endYmd && !oppInRange(opp, startYmd, endYmd)) continue;
        seenOpp.add(opp.id);
        out.push({
          opp,
          stageName: stageNameById.get(opp.pipelineStageId ?? "") ?? "",
          pipelineName: pipeline.name ?? pipeline.id,
          pipelineId: pipeline.id,
        });
      }
    }
    opportunityCache.set(cacheKey, { at: Date.now(), rows: out });
    return out;
  },
);

export async function listGhlOpportunitiesInRange(
  range?: MarketingRange,
  coordinator?: TcCoordinator,
): Promise<GhlOpportunityContext[]> {
  const all = await loadOpportunityContexts(
    range?.startYmd ?? "",
    range?.endYmd ?? "",
  );
  if (!coordinator) return all;
  return all.filter((ctx) =>
    opportunityBelongsToCoordinator(ctx.opp, coordinator),
  );
}

export { listPipelines };
