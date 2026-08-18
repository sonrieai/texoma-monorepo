/** Money helpers — cents are source of truth for derived marketing metrics. */

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatUsd(dollars: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

export function formatUsdCompact(dollars: number): string {
  if (Math.abs(dollars) >= 1000) {
    return `$${Math.round(dollars / 1000)}k`;
  }
  return formatUsd(dollars);
}

export function formatPct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/** Avoid showing 0 when the upstream source did not load. */
export function formatCount(value: number, sourceAvailable = true): string {
  if (!sourceAvailable) return "—";
  return String(value);
}

export function formatUsdFromCentsOrDash(
  cents: number,
  sourceAvailable: boolean,
): string {
  if (!sourceAvailable) return "—";
  return formatUsd(centsToDollars(cents));
}

export function safeRate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function costPer(spendCents: number, count: number): number | null {
  if (!count) return null;
  return spendCents / count;
}

export function roi(productionCents: number, spendCents: number): number | null {
  if (!spendCents) return null;
  return (productionCents - spendCents) / spendCents;
}

export function showRate(showed: number, booked: number): number {
  return safeRate(showed, booked);
}

export type FunnelRow = {
  name: string;
  leads: number;
  booked: number;
  showed: number;
  closedPaid?: number;
  production: number;
  spend?: number;
};

export type ChannelEfficiency = {
  name: string;
  costPerLeadCents: number | null;
  costPerBookedCents: number | null;
  showRate: number;
  roi: number | null;
  spendCents: number;
  productionCents: number;
};

export function channelEfficiency(rows: FunnelRow[]): ChannelEfficiency[] {
  return rows.map((row) => {
    const spendCents = dollarsToCents(row.spend ?? 0);
    const productionCents = dollarsToCents(row.production);
    return {
      name: row.name,
      costPerLeadCents: costPer(spendCents, row.leads),
      costPerBookedCents: costPer(spendCents, row.booked),
      showRate: showRate(row.showed, row.booked),
      roi: roi(productionCents, spendCents),
      spendCents,
      productionCents,
    };
  });
}

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
