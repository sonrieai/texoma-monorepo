/**
 * GoHighLevel adapter — live when saved JSON settings or GHL_API_KEY + GHL_LOCATION_ID are set.
 */

export {
  isGhlConfigured,
  isGhlConfiguredFromEnv,
  getGhlConfig,
  resolveGhlConfigSource,
  GhlConfigError,
  type GhlConfigSource,
} from "@/lib/ghl/config";
export type { GhlConfig } from "@/lib/ghl/types";
export {
  loadMarketingSummary,
  adSpendByChannel,
  pipelineStats,
  listLeads,
  stageTierFromName,
  type AdChannel,
  type ChannelFunnel,
  type GhlLead,
  type MarketingSummary,
  type MarketingRange,
  type ReferralSourceRow,
  type MarketingScoreItem,
} from "@/lib/ghl/marketing";
export {
  loadAdSpendByChannel,
  type AdSpendByChannel,
} from "@/lib/ghl/ad-spend";
