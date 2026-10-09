/**
 * Shared GoHighLevel opportunity fetch for marketing + TC decline charts.
 */

import { getGhlConfig, isGhlConfigured } from "@/lib/ghl/config";
import { ghlFetch } from "@/lib/ghl/http";
import type { GhlConfig } from "@/lib/ghl/types";
import type { MarketingRange } from "@/lib/ghl/marketing";
import { opportunityBelongsToCoordinator } from "@/lib/tc/ghl-attribution";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";

const MAX_PAGES_PER_PIPELINE = 20;
const PAGE_SIZE = 100;
const LOOKBACK_DAYS = 90;

type GhlPipelineStage = { id: string; name?: string; position?: number };
type GhlPipeline = {
  id: string;
  name?: string;
  stages?: GhlPipelineStage[];
};

export type GhlOpportunity = {
  id: string;
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

function preferMarketingPipelines(pipelines: GhlPipeline[]): GhlPipeline[] {
  const scored = pipelines.map((p) => {
    const name = (p.name ?? "").toLowerCase();
    let score = 0;
    if (/call center|appointment system|marketing/.test(name)) score += 10;
    if (/nurtur|long term/.test(name)) score += 2;
    if ((p.stages?.length ?? 0) > 5) score += 1;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.filter((s) => s.score >= 10).map((s) => s.p);
  return picked.length > 0 ? picked : pipelines.slice(0, 2);
}

async function listPipelines(config: GhlConfig): Promise<GhlPipeline[]> {
  const data = await ghlFetch<{ pipelines?: GhlPipeline[] }>(
    `/opportunities/pipelines?locationId=${encodeURIComponent(config.locationId)}`,
    {},
    config,
  );
  return data.pipelines ?? [];
}

function slimGhlOpportunity(raw: GhlOpportunity): GhlOpportunity {
  const rest = { ...raw };
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

export async function listGhlOpportunitiesInRange(
  range?: MarketingRange,
  coordinator?: TcCoordinator,
  config?: GhlConfig,
): Promise<GhlOpportunityContext[]> {
  if (!(await isGhlConfigured())) return [];

  const cfg = config ?? (await getGhlConfig());
  const startYmd = range?.startYmd;
  const endYmd = range?.endYmd;
  const since = startYmd ? ymdToMmDdYyyy(startYmd) : lookbackStartDate();

  const pipelines = await listPipelines(cfg);
  if (pipelines.length === 0) return [];

  const stageNameById = new Map<string, string>();
  for (const p of pipelines) {
    for (const s of p.stages ?? []) {
      if (s.id) stageNameById.set(s.id, s.name ?? "");
    }
  }

  const selected = preferMarketingPipelines(pipelines);
  const seenOpp = new Set<string>();
  const out: GhlOpportunityContext[] = [];

  for (const pipeline of selected) {
    const opps = await listOpportunitiesForPipeline(cfg, pipeline.id, since);
    for (const opp of opps) {
      if (seenOpp.has(opp.id)) continue;
      if (startYmd && endYmd && !oppInRange(opp, startYmd, endYmd)) continue;
      if (coordinator && !opportunityBelongsToCoordinator(opp, coordinator)) {
        continue;
      }
      seenOpp.add(opp.id);
      out.push({
        opp,
        stageName: stageNameById.get(opp.pipelineStageId ?? "") ?? "",
        pipelineName: pipeline.name ?? pipeline.id,
      });
    }
  }

  return out;
}

export { preferMarketingPipelines, listPipelines };
