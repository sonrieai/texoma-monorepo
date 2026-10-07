/**
 * Insurance-page display helpers. Money stays in cents until chart/UI formatters.
 */

import { centsToDollars } from "@/lib/metrics";
import type { ArAgingBuckets } from "@/lib/warehouse/ar";
import type { MonthlyProductionSeries } from "@/lib/warehouse/production";
import type { PaymentMix } from "@/lib/warehouse/payment-mix";

export const INSURANCE_SECTIONS = [
  "Cockpit Metrics",
  "Claims Pipeline",
  "Outstanding Claims",
  "Insurance AR Aging",
  "Collections Trend",
  "SoonerCare",
] as const;

export const CLAIMS_SYNC_NOTE = "Requires claims sync";

export const COLLECTION_RATIO_TARGET = 0.98;
export const COLLECTION_RATIO_WARN = 0.95;

export type AgingDetailRow = {
  label: string;
  cents: number;
  share: number;
};

const AGING_BUCKETS: { label: string; key: keyof ArAgingBuckets }[] = [
  { label: "0–30 days", key: "under30Cents" },
  { label: "31–60 days", key: "days31to60Cents" },
  { label: "61–90 days", key: "days61to90Cents" },
  { label: "90+ days", key: "over90Cents" },
];

export function arAgingTotalCents(aging: ArAgingBuckets): number {
  return (
    aging.under30Cents +
    aging.days31to60Cents +
    aging.days61to90Cents +
    aging.over90Cents
  );
}

export function arAgingDetailRows(aging: ArAgingBuckets): AgingDetailRow[] {
  const total = arAgingTotalCents(aging);
  return AGING_BUCKETS.map(({ label, key }) => {
    const cents = aging[key];
    return {
      label,
      cents,
      share: total > 0 ? cents / total : 0,
    };
  });
}

/** Mockup heat: 0.05 + 0.34 * (value / max). */
export function agingHeatAlpha(cents: number, maxCents: number): number {
  if (maxCents <= 0) return 0.05;
  return 0.05 + 0.34 * (cents / maxCents);
}

export function insurancePayerMixSlices(mix: PaymentMix): {
  label: string;
  value: number;
}[] {
  return [
    { label: "Cash", value: centsToDollars(mix.cash) },
    { label: "Insurance", value: centsToDollars(mix.insurance) },
    { label: "Financed", value: centsToDollars(mix.financed) },
    { label: "SoonerCare", value: centsToDollars(mix.soonercare) },
  ].filter((s) => s.value > 0);
}

export type InsuranceCollectionsTrend = {
  xLabels: string[];
  production: number[];
  collected: number[];
};

function productionDollarsForMonth(
  monthlyProduction: MonthlyProductionSeries[],
  monthKey: string,
): number {
  const year = Number.parseInt(monthKey.slice(0, 4), 10);
  const monthIndex = Number.parseInt(monthKey.slice(5, 7), 10) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return 0;
  const series = monthlyProduction.find((s) => s.year === year);
  return series?.months[monthIndex] ?? 0;
}

/** Align last-6-month collections with matching monthly production (dollars). */
export function insuranceCollectionsTrend(
  monthlyCollections: {
    label: string;
    monthKey: string;
    cents: number;
    productionCents?: number;
  }[],
  monthlyProduction: MonthlyProductionSeries[],
): InsuranceCollectionsTrend {
  return {
    xLabels: monthlyCollections.map((m) => m.label),
    production: monthlyCollections.map((m) =>
      m.productionCents != null
        ? centsToDollars(m.productionCents)
        : productionDollarsForMonth(monthlyProduction, m.monthKey),
    ),
    collected: monthlyCollections.map((m) => centsToDollars(m.cents)),
  };
}
