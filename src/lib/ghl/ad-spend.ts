/**
 * Ad spend from GoHighLevel Ad Manager reporting (Facebook + Google).
 * Requires Private Integration scope `adPublishing.readonly` and connected ad accounts.
 */

import { GhlApiError, ghlFetch } from "@/lib/ghl/http";
import type { GhlConfig } from "@/lib/ghl/types";

export type AdSpendByChannel = {
  /** Dollars by normalized marketing channel label (e.g. "Facebook", "Google Ads"). */
  byChannel: Map<string, number>;
  total: number;
  notices: string[];
  /** True when at least one reporting call returned usable spend. */
  available: boolean;
};

type ReportingType = "INTEGRATION" | "AD_MANAGER";

const FB_FIELDS = "impressions,clicks,spend";
const GOOGLE_FIELDS = "impressions,clicks,cost_micros";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Coerce spend-like fields to dollars (Google `cost_micros` → dollars). */
function dollarsFromMetric(
  row: Record<string, unknown>,
  keys: string[],
): number {
  for (const key of keys) {
    const raw = row[key];
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : NaN;
    if (!Number.isFinite(n) || n < 0) continue;
    if (key === "cost_micros" || key.endsWith("_micros")) {
      return n / 1_000_000;
    }
    return n;
  }
  return 0;
}

/**
 * Walk common GHL reporting payload shapes and sum spend/cost.
 * Docs omit a stable schema; tolerate nested `data` / `metrics` / period rows.
 */
function sumSpendFromPayload(
  payload: unknown,
  metricKeys: string[],
): number {
  let total = 0;

  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const row = asRecord(node);
    if (!row) return;

    const direct = dollarsFromMetric(row, metricKeys);
    if (direct > 0) total += direct;

    for (const nestedKey of [
      "data",
      "results",
      "rows",
      "metrics",
      "items",
      "report",
      "reporting",
    ]) {
      if (nestedKey in row) visit(row[nestedKey], depth + 1);
    }
  };

  visit(payload, 0);
  return total;
}

async function fetchPlatformSpend(
  config: GhlConfig,
  platform: "facebook" | "google",
  startYmd: string,
  endYmd: string,
): Promise<{ spend: number; notice?: string }> {
  const fields = platform === "facebook" ? FB_FIELDS : GOOGLE_FIELDS;
  const metricKeys =
    platform === "facebook"
      ? ["spend", "amountSpent", "amount_spent", "cost"]
      : ["cost_micros", "spend", "cost", "amountSpent"];

  const types: ReportingType[] = ["INTEGRATION", "AD_MANAGER"];
  const errors: string[] = [];

  for (const type of types) {
    const params = new URLSearchParams({
      locationId: config.locationId,
      fields,
      startDate: startYmd,
      endDate: endYmd,
      type,
    });
    if (platform === "facebook") params.set("groupBy", "month");
    else params.set("groupBy", "month");

    try {
      const payload = await ghlFetch<unknown>(
        `/ad-publishing/${platform}/reporting?${params.toString()}`,
        {},
        config,
      );
      const spend = sumSpendFromPayload(payload, metricKeys);
      if (spend > 0) {
        return { spend };
      }
      // Empty success — try next type (AD_MANAGER vs INTEGRATION).
      errors.push(`${type}: no spend rows`);
    } catch (e) {
      if (e instanceof GhlApiError) {
        if (e.status === 401 || e.status === 403) {
          return {
            spend: 0,
            notice: `${platform === "facebook" ? "Facebook" : "Google"} ads reporting needs scope adPublishing.readonly on the GHL token.`,
          };
        }
        if (e.status === 404 || e.status === 422) {
          errors.push(`${type}: not connected (${e.status})`);
          continue;
        }
        errors.push(`${type}: ${e.message}`);
        continue;
      }
      errors.push(
        e instanceof Error ? e.message : `${platform} reporting failed`,
      );
    }
  }

  if (errors.length > 0) {
    const label = platform === "facebook" ? "Facebook" : "Google";
    return {
      spend: 0,
      notice: `${label} ad spend unavailable (${errors[0]}). Connect ads in GHL Ad Manager or Integration.`,
    };
  }
  return { spend: 0 };
}

/**
 * Load Facebook + Google ad spend for a date range and map to marketing channels.
 */
export async function loadAdSpendByChannel(
  config: GhlConfig,
  startYmd: string,
  endYmd: string,
): Promise<AdSpendByChannel> {
  const notices: string[] = [];
  const byChannel = new Map<string, number>();

  const [fb, google] = await Promise.all([
    fetchPlatformSpend(config, "facebook", startYmd, endYmd),
    fetchPlatformSpend(config, "google", startYmd, endYmd),
  ]);

  if (fb.notice) notices.push(fb.notice);
  if (google.notice) notices.push(google.notice);

  if (fb.spend > 0) {
    byChannel.set("Facebook", (byChannel.get("Facebook") ?? 0) + fb.spend);
  }
  if (google.spend > 0) {
    byChannel.set(
      "Google Ads",
      (byChannel.get("Google Ads") ?? 0) + google.spend,
    );
  }

  let total = 0;
  for (const v of byChannel.values()) total += v;

  return {
    byChannel,
    total,
    notices,
    available: total > 0,
  };
}

/** Apply platform spend onto funnel channels (mutates map). */
export function mergeSpendIntoChannels(
  bySource: Map<string, { spend: number; name: string }>,
  spend: AdSpendByChannel,
  emptyChannel: (name: string) => { spend: number; name: string },
): void {
  for (const [name, dollars] of spend.byChannel) {
    if (dollars <= 0) continue;
    const existing = bySource.get(name);
    if (existing) {
      existing.spend += dollars;
      continue;
    }
    // Meta Ads often fund Instagram-attributed leads — prefer Instagram row if no Facebook funnel.
    if (name === "Facebook") {
      const ig = bySource.get("Instagram");
      if (ig) {
        ig.spend += dollars;
        continue;
      }
    }
    const ch = emptyChannel(name);
    ch.spend = dollars;
    bySource.set(name, ch);
  }
}

/** @internal test helper */
export function __testSumSpendFromPayload(
  payload: unknown,
  metricKeys: string[],
): number {
  return sumSpendFromPayload(payload, metricKeys);
}
