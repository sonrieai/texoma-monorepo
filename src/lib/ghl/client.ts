/**
 * GoHighLevel adapter — live when GHL_API_KEY + GHL_LOCATION_ID are set.
 */

export { isGhlConfigured, getGhlConfig, GhlConfigError } from "@/lib/ghl/config";
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
