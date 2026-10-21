/**
 * Marketing summary from GoHighLevel opportunities + Ad Manager spend.
 * Funnel/ROI use opportunities; spend comes from Ad Publishing reporting
 * (Facebook + Google) when `adPublishing.readonly` is granted.
 */

import {
  loadAdSpendByChannel,
  mergeSpendIntoChannels,
} from "@/lib/ghl/ad-spend";
import { getGhlConfig, isGhlConfigured } from "@/lib/ghl/config";
import {
  listGhlOpportunitiesInRange,
  type GhlOpportunity,
} from "@/lib/ghl/opportunities";
import {
  formatResponseMinutes,
  loadMedianResponseMinutes,
} from "@/lib/ghl/response-time";
import {
  isExcludedFakeLeadStage,
  stageTierFromConfiguredId,
} from "@/lib/ghl/funnel-stage-tiers";
import { TIER_RANK, type FunnelTier } from "@/lib/ghl/tc-stage-tiers";
import { safeRate } from "@/lib/metrics";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";

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
  /** Median first-response minutes from GoHighLevel. Null when the CRM has none. */
  responseMinutes: number | null;
};

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
    responseMinutes: null,
  };
}

function rangeLookbackDays(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T12:00:00Z`).getTime();
  const end = new Date(`${endYmd}T12:00:00Z`).getTime();
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  return Math.min(Math.max(days, 1), 365);
}

/** Map pipeline stage name → funnel tier. Unknown names are unmapped (not lead). */
export function stageTierFromName(raw: string | null | undefined): FunnelTier {
  const n = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!n) return "unmapped";
  if (/\blost\b|\bdeclin/.test(n)) return "lead";
  if (/\bno-?show\b|\bcancel/.test(n)) return "booked";
  if (/\bsold\b|\bsurgery\b|\bclosed\b|\bwon\b/.test(n)) return "surgery";
  if (/accepted treatment|accepted\b/.test(n)) return "accepted";
  if (/\bshowed\b/.test(n)) return "showed";
  if (/\bbooked\b/.test(n)) return "booked";
  return "unmapped";
}

/** Stage id map first; name heuristics only when id is unknown. */
export function resolveOpportunityTier(
  params: {
    pipelineStageId?: string | null;
    stageName?: string | null;
    opportunityId?: string | null;
  },
  tierMap?: Readonly<Record<string, FunnelTier>>,
): FunnelTier {
  const id = (params.pipelineStageId ?? "").trim();
  if (isExcludedFakeLeadStage(id)) return "unmapped";
  const fromId = stageTierFromConfiguredId(id, tierMap);
  let tier: FunnelTier;
  if (fromId !== "unmapped" || !id) {
    tier = fromId;
  } else {
    tier = stageTierFromName(params.stageName);
  }
  return tier;
}

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

function isGenericSource(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  return !s || /^(social media|other|unknown|direct|none)$/.test(s);
}

function attributionSource(opp: GhlOpportunity): string {
  const attrs = opp.attributions ?? [];
  const first = attrs.find((a) => a.isFirst) ?? attrs[0];
  const medium = first?.medium || first?.utmMedium || null;
  const session = first?.utmSessionSource || first?.utmSource || null;
  const campaign = first?.utmCampaign || first?.campaign || null;
  if (medium && (isGenericSource(session) || /social/i.test(session ?? ""))) {
    return normalizeSourceLabel(medium);
  }
  if (session && !isGenericSource(session)) return normalizeSourceLabel(session);
  if (medium) return normalizeSourceLabel(medium);
  if (campaign) return normalizeSourceLabel(campaign);
  if (opp.source?.trim() && !isGenericSource(opp.source)) {
    return normalizeSourceLabel(opp.source);
  }
  return "Unknown";
}

function bumpChannel(ch: AdChannel, tier: FunnelTier, productionDollars: number) {
  if (tier === "unmapped") return;
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
  responseMinutes: number | null;
  goals: MarketingGoals;
}): MarketingScoreItem[] {
  const { showRate, acceptanceRate, roi, costPerArch, responseMinutes, goals } =
    params;
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
      show:
        responseMinutes != null ? formatResponseMinutes(responseMinutes) : "—",
      goal: `< ${goals.responseMin} min`,
      pass:
        responseMinutes == null
          ? null
          : responseMinutes < goals.responseMin,
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
  options?: { funnelOnly?: boolean },
): Promise<MarketingSummary> {
  if (!(await isGhlConfigured())) {
    return emptySummary([
      "Connect GoHighLevel in Settings to show live funnel and referral sources.",
    ]);
  }

  const {
    mergedStageTierMap,
    readFunnelSettings,
    persistFurthestTiers,
    effectiveOpportunityTier,
  } = await import("@/lib/ghl/funnel-settings-store");
  const tierMap = await mergedStageTierMap();
  const funnelDoc = await readFunnelSettings();
  let furthestDirty = false;
  let unmappedStageCount = 0;

  const config = await getGhlConfig();
  const notices: string[] = [];
  notices.push("Speed-to-lead: known gap (not sourced from GoHighLevel).");

  try {
    const startYmd = range?.startYmd;
    const endYmd = range?.endYmd;
    const lookbackDays = startYmd && endYmd
      ? rangeLookbackDays(startYmd, endYmd)
      : LOOKBACK_DAYS;
    const spendStartYmd =
      startYmd ??
      new Date(Date.now() - LOOKBACK_DAYS * 86400000)
        .toISOString()
        .slice(0, 10);
    const spendEndYmd = endYmd ?? new Date().toISOString().slice(0, 10);

    const contexts = await listGhlOpportunitiesInRange(range, coordinator);
    const bySource = new Map<string, AdChannel>();
    let opportunityCount = 0;
    for (const { opp, stageName } of contexts) {
      if (isExcludedFakeLeadStage(opp.pipelineStageId)) continue;
      const currentTier = resolveOpportunityTier(
        {
          pipelineStageId: opp.pipelineStageId,
          stageName,
          opportunityId: opp.id,
        },
        tierMap,
      );
      if (currentTier === "unmapped") {
        if ((opp.pipelineStageId ?? "").trim()) unmappedStageCount += 1;
        continue;
      }
      const prevMax = funnelDoc.maxTierByOpportunity[opp.id];
      const tier = effectiveOpportunityTier(funnelDoc, opp.id, currentTier);
      if (tier !== prevMax) {
        funnelDoc.maxTierByOpportunity[opp.id] = tier;
        furthestDirty = true;
      }
      opportunityCount += 1;
      const source = attributionSource(opp);
      const ch = bySource.get(source) ?? emptyChannel(source);
      const dollars =
        typeof opp.monetaryValue === "number" && Number.isFinite(opp.monetaryValue)
          ? opp.monetaryValue
          : 0;
      bumpChannel(ch, tier, dollars);
      bySource.set(source, ch);
    }

    const [adSpend, responseMinutes] = options?.funnelOnly
      ? [
          {
            byChannel: new Map<string, number>(),
            total: 0,
            notices: [] as string[],
            available: false,
          },
          null,
        ]
      : await Promise.all([
          loadAdSpendByChannel(config, spendStartYmd, spendEndYmd),
          loadMedianResponseMinutes(config, spendStartYmd, spendEndYmd),
        ]);
    if (adSpend.available) {
      notices.push(
        `Ad spend from GHL Ad Manager (Facebook + Google) · ${spendStartYmd} → ${spendEndYmd}.`,
      );
    }
    mergeSpendIntoChannels(bySource, adSpend, emptyChannel);

    const channels = [...bySource.values()].sort(
      (a, b) =>
        b.spend - a.spend ||
        b.leads - a.leads ||
        b.production - a.production,
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

    if (unmappedStageCount > 0) {
      notices.push(
        `${unmappedStageCount} opportunity card(s) use unmapped GoHighLevel stage ids — map them under Settings → GoHighLevel funnel.`,
      );
    }
    await persistFurthestTiers(funnelDoc, furthestDirty);

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
        responseMinutes,
        goals: DEFAULT_GOALS,
      }),
      opportunityCount,
      lookbackDays,
      responseMinutes,
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
