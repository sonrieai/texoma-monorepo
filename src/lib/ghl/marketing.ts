/**
 * Marketing summary from GoHighLevel opportunities + attribution.
 * Ad spend is not available from GHL CRM APIs — spend/ROI stay null until
 * ads platforms (or a custom spend field) are wired.
 */

import { getGhlConfig, isGhlConfigured, type GhlConfig } from "@/lib/ghl/config";
import { ghlFetch } from "@/lib/ghl/http";
import { safeRate } from "@/lib/metrics";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";
import { opportunityBelongsToCoordinator } from "@/lib/tc/ghl-attribution";

const MAX_PAGES_PER_PIPELINE = 5;
const PAGE_SIZE = 100;
/** Lookback for opportunity `date` filter when no dashboard period is passed. */
const LOOKBACK_DAYS = 90;

export type MarketingRange = {
  startYmd: string;
  endYmd: string;
};

export type AdChannel = {
  name: string;
  spend: number;
  leads: number;
  booked: number;
  showed: number;
  accepted: number;
  surgery: number;
  production: number;
};

export type ChannelFunnel = {
  name: string;
  leads: number;
  booked: number;
  showed: number;
  presented: number;
  closedPaid: number;
  production: number;
};

export type GhlLead = {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  stage: "lead" | "booked" | "showed" | "sold";
};

export type ReferralSourceRow = {
  source: string;
  newPatients: number;
  production: number;
};

export type MarketingGoals = {
  costPerArch: number;
  showRate: number;
  acceptance: number;
  responseMin: number;
  roi: number;
};

export type MarketingScoreItem = {
  label: string;
  show: string;
  goal: string;
  pass: boolean | null;
};

export type MarketingSummary = {
  available: boolean;
  notices: string[];
  channels: AdChannel[];
  referralSources: ReferralSourceRow[];
  totals: {
    leads: number;
    booked: number;
    showed: number;
    accepted: number;
    surgery: number;
    production: number;
    spend: number;
  };
  /** Production ÷ spend when spend > 0. */
  roi: number | null;
  costPerArch: number | null;
  costPerLead: number | null;
  showRate: number | null;
  acceptanceRate: number | null;
  scorecard: MarketingScoreItem[];
  opportunityCount: number;
  lookbackDays: number;
};

type GhlPipelineStage = { id: string; name?: string; position?: number };
type GhlPipeline = {
  id: string;
  name?: string;
  stages?: GhlPipelineStage[];
};

type GhlAttribution = {
  utmSessionSource?: string | null;
  utmSource?: string | null;
  campaign?: string | null;
  medium?: string | null;
  isFirst?: boolean;
};

type GhlOpportunity = {
  id: string;
  name?: string;
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
  attributions?: GhlAttribution[];
  contact?: { name?: string | null; tags?: string[] };
};

type FunnelTier = "lead" | "booked" | "showed" | "accepted" | "surgery";

const DEFAULT_GOALS: MarketingGoals = {
  costPerArch: 700,
  showRate: 0.75,
  acceptance: 0.6,
  responseMin: 5,
  roi: 10,
};

function emptyChannel(name: string): AdChannel {
  return {
    name,
    spend: 0,
    leads: 0,
    booked: 0,
    showed: 0,
    accepted: 0,
    surgery: 0,
    production: 0,
  };
}

function emptySummary(notices: string[]): MarketingSummary {
  return {
    available: false,
    notices,
    channels: [],
    referralSources: [],
    totals: {
      leads: 0,
      booked: 0,
      showed: 0,
      accepted: 0,
      surgery: 0,
      production: 0,
      spend: 0,
    },
    roi: null,
    costPerArch: null,
    costPerLead: null,
    showRate: null,
    acceptanceRate: null,
    scorecard: [],
    opportunityCount: 0,
    lookbackDays: LOOKBACK_DAYS,
  };
}

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

function rangeLookbackDays(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T12:00:00Z`).getTime();
  const end = new Date(`${endYmd}T12:00:00Z`).getTime();
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  return Math.min(Math.max(days, 1), 365);
}

/** Map pipeline stage name → furthest funnel tier reached. */
export function stageTierFromName(raw: string | null | undefined): FunnelTier {
  const n = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!n) return "lead";
  if (/\bno-?show\b|\bcancel/.test(n)) return "booked";
  if (/\bsold\b|\bsurgery\b/.test(n)) return "surgery";
  if (/accepted treatment|accepted\b/.test(n)) return "accepted";
  if (/\bshowed\b/.test(n)) return "showed";
  if (
    /consult booked|consult confirmed|appointment confirmed|appointment booked/.test(
      n,
    )
  ) {
    return "booked";
  }
  return "lead";
}

const TIER_RANK: Record<FunnelTier, number> = {
  lead: 0,
  booked: 1,
  showed: 2,
  accepted: 3,
  surgery: 4,
};

function normalizeSourceLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "Unknown";
  const lower = s.toLowerCase();
  if (/google\s*ads|gclid|cpc/.test(lower) && /google/.test(lower)) {
    return "Google Ads";
  }
  if (/organic\s*search|google/.test(lower) && !/ads|cpc|gclid/.test(lower)) {
    return "Organic Search";
  }
  if (/facebook|fb\b|meta/.test(lower)) return "Facebook";
  if (/instagram|ig\b/.test(lower)) return "Instagram";
  if (/mailer|direct mail/.test(lower)) return "Mailers";
  if (/\btv\b|television/.test(lower)) return "TV";
  if (/referral|patient/.test(lower)) return "Referral";
  if (/sooner\s*care|medicaid/.test(lower)) return "SoonerCare";
  if (/third\s*party|zapier|lgg/.test(lower)) return "Third Party";
  if (/website|web\s*form|funnel/.test(lower)) return "Website";
  // Title-case short labels
  if (s.length <= 40) {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return s.slice(0, 40);
}

function attributionSource(opp: GhlOpportunity): string {
  const attrs = opp.attributions ?? [];
  const first = attrs.find((a) => a.isFirst) ?? attrs[0];
  const fromAttr =
    first?.utmSessionSource ||
    first?.utmSource ||
    first?.campaign ||
    null;
  if (fromAttr) return normalizeSourceLabel(fromAttr);
  if (opp.source?.trim()) return normalizeSourceLabel(opp.source);
  return "Unknown";
}

function preferMarketingPipelines(pipelines: GhlPipeline[]): GhlPipeline[] {
  const scored = pipelines.map((p) => {
    const name = (p.name ?? "").toLowerCase();
    let score = 0;
    if (/call center|appointment system/.test(name)) score += 10;
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

    const batch = data.opportunities ?? [];
    out.push(...batch);
    if (batch.length < PAGE_SIZE || !data.meta?.nextPage) break;
    startAfter =
      data.meta.startAfter != null ? String(data.meta.startAfter) : undefined;
    startAfterId = data.meta.startAfterId;
    if (!startAfter || !startAfterId) break;
  }

  return out;
}

function bumpChannel(ch: AdChannel, tier: FunnelTier, productionDollars: number) {
  ch.leads += 1;
  if (TIER_RANK[tier] >= TIER_RANK.booked) ch.booked += 1;
  if (TIER_RANK[tier] >= TIER_RANK.showed) ch.showed += 1;
  if (TIER_RANK[tier] >= TIER_RANK.accepted) ch.accepted += 1;
  if (TIER_RANK[tier] >= TIER_RANK.surgery) ch.surgery += 1;
  ch.production += productionDollars;
}

function buildScorecard(params: {
  showRate: number | null;
  acceptanceRate: number | null;
  roi: number | null;
  costPerArch: number | null;
  goals: MarketingGoals;
}): MarketingScoreItem[] {
  const { showRate, acceptanceRate, roi, costPerArch, goals } = params;
  return [
    {
      label: "Cost per arch",
      show: costPerArch != null ? `$${Math.round(costPerArch)}` : "—",
      goal: `< $${goals.costPerArch}`,
      pass:
        costPerArch == null ? null : costPerArch < goals.costPerArch,
    },
    {
      label: "Show rate",
      show:
        showRate != null ? `${Math.round(showRate * 1000) / 10}%` : "—",
      goal: `> ${Math.round(goals.showRate * 100)}%`,
      pass: showRate == null ? null : showRate > goals.showRate,
    },
    {
      label: "Treatment acceptance",
      show:
        acceptanceRate != null
          ? `${Math.round(acceptanceRate * 1000) / 10}%`
          : "—",
      goal: `> ${Math.round(goals.acceptance * 100)}%`,
      pass:
        acceptanceRate == null ? null : acceptanceRate > goals.acceptance,
    },
    {
      label: "Lead response time",
      show: "—",
      goal: `< ${goals.responseMin} min`,
      pass: null,
    },
    {
      label: "Marketing ROI",
      show: roi != null ? `${roi.toFixed(1)}x` : "—",
      goal: `> ${goals.roi}x`,
      pass: roi == null ? null : roi > goals.roi,
    },
  ];
}

export async function loadMarketingSummary(
  range?: MarketingRange,
  coordinator?: TcCoordinator,
): Promise<MarketingSummary> {
  if (!isGhlConfigured()) {
    return emptySummary([
      "Connect marketing CRM credentials for live funnel and sources.",
    ]);
  }

  const config = getGhlConfig();
  const notices: string[] = [];

  try {
    const pipelines = await listPipelines(config);
    if (pipelines.length === 0) {
      return emptySummary(["No marketing pipelines found for this location."]);
    }

    const stageNameById = new Map<string, string>();
    for (const p of pipelines) {
      for (const s of p.stages ?? []) {
        if (s.id) stageNameById.set(s.id, s.name ?? "");
      }
    }

    const selected = preferMarketingPipelines(pipelines);
    notices.push(
      `Pipelines: ${selected.map((p) => p.name ?? p.id).join(", ")}.`,
    );
    notices.push(
      "Ad spend and ROI need ads platforms or a spend field — CRM opportunities do not include channel spend.",
    );

    const startYmd = range?.startYmd;
    const endYmd = range?.endYmd;
    const since = startYmd
      ? ymdToMmDdYyyy(startYmd)
      : lookbackStartDate();
    const lookbackDays = startYmd && endYmd
      ? rangeLookbackDays(startYmd, endYmd)
      : LOOKBACK_DAYS;
    const seenOpp = new Set<string>();
    const bySource = new Map<string, AdChannel>();

    let opportunityCount = 0;
    for (const pipeline of selected) {
      const opps = await listOpportunitiesForPipeline(
        config,
        pipeline.id,
        since,
      );
      for (const opp of opps) {
        if (seenOpp.has(opp.id)) continue;
        if (startYmd && endYmd && !oppInRange(opp, startYmd, endYmd)) continue;
        if (coordinator && !opportunityBelongsToCoordinator(opp, coordinator)) {
          continue;
        }
        seenOpp.add(opp.id);
        opportunityCount += 1;

        const stageName = stageNameById.get(opp.pipelineStageId ?? "") ?? "";
        const tier = stageTierFromName(stageName);
        const source = attributionSource(opp);
        const ch = bySource.get(source) ?? emptyChannel(source);
        const dollars =
          typeof opp.monetaryValue === "number" && Number.isFinite(opp.monetaryValue)
            ? opp.monetaryValue
            : 0;
        bumpChannel(ch, tier, dollars);
        bySource.set(source, ch);
      }
    }

    const channels = [...bySource.values()].sort(
      (a, b) => b.leads - a.leads || b.production - a.production,
    );

    const totals = channels.reduce(
      (acc, c) => {
        acc.leads += c.leads;
        acc.booked += c.booked;
        acc.showed += c.showed;
        acc.accepted += c.accepted;
        acc.surgery += c.surgery;
        acc.production += c.production;
        acc.spend += c.spend;
        return acc;
      },
      {
        leads: 0,
        booked: 0,
        showed: 0,
        accepted: 0,
        surgery: 0,
        production: 0,
        spend: 0,
      },
    );

    const showRate =
      totals.booked > 0 ? safeRate(totals.showed, totals.booked) : null;
    const acceptanceRate =
      totals.showed > 0 ? safeRate(totals.accepted, totals.showed) : null;
    const costPerLead =
      totals.spend > 0 && totals.leads > 0
        ? totals.spend / totals.leads
        : null;
    const costPerArch =
      totals.spend > 0 && totals.surgery > 0
        ? totals.spend / totals.surgery
        : null;
    const roi =
      totals.spend > 0 ? totals.production / totals.spend : null;

    const referralSources: ReferralSourceRow[] = channels.map((c) => ({
      source: c.name,
      newPatients: c.showed > 0 ? c.showed : c.leads,
      production: c.production,
    }));

    return {
      available: opportunityCount > 0 || channels.length > 0,
      notices,
      channels,
      referralSources,
      totals,
      roi,
      costPerArch,
      costPerLead,
      showRate,
      acceptanceRate,
      scorecard: buildScorecard({
        showRate,
        acceptanceRate,
        roi,
        costPerArch,
        goals: DEFAULT_GOALS,
      }),
      opportunityCount,
      lookbackDays,
    };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Marketing data could not be loaded";
    return emptySummary([
      /\b(ghl|leadconnector|unauthorized|401|403)\b/i.test(msg)
        ? "Marketing CRM request failed. Check credentials or try again later."
        : msg,
    ]);
  }
}

/** @deprecated Prefer loadMarketingSummary — kept for existing imports. */
export async function adSpendByChannel(): Promise<AdChannel[]> {
  const summary = await loadMarketingSummary();
  return summary.channels;
}

export async function pipelineStats(): Promise<ChannelFunnel[]> {
  const summary = await loadMarketingSummary();
  return summary.channels.map((c) => ({
    name: c.name,
    leads: c.leads,
    booked: c.booked,
    showed: c.showed,
    presented: c.accepted,
    closedPaid: c.surgery,
    production: c.production,
  }));
}

export async function listLeads(): Promise<GhlLead[]> {
  // Individual lead rows are not materialized — use loadMarketingSummary channels.
  return [];
}
