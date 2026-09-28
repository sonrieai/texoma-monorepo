/**
 * Insurance coordinator metrics from warehouse claims, balances, and plans.
 * PHI-safe aggregates only (counts, cents, payer names).
 */

import {
  moneyToCents,
  type ClaimRecord,
  type InsuranceBalanceRecord,
  type InsurancePlanRecord,
} from "@/lib/warehouse/types";
import type { ArAgingBuckets } from "@/lib/warehouse/ar";

const SOONERCARE_PLAN =
  /\b(sooner\s*care|soonercare|medicaid|ohca)\b/i;

const DAYS_IN_AR_MIDPOINTS = {
  under30: 15,
  days31to60: 45,
  days61to90: 75,
  over90: 105,
} as const;

export type OutstandingClaimAging = {
  d0Cents: number;
  d30Cents: number;
  d60Cents: number;
  d90Cents: number;
};

export type InsurancePayerMixRow = {
  label: string;
  cents: number;
};

export type InsuranceMetrics = {
  available: boolean;
  claimsAvailable: boolean;
  balancesAvailable: boolean;
  notices: string[];
  claimsSubmitted: number;
  claimsPaid: number;
  claimsCanceled: number;
  billedCents: number;
  allowedCents: number;
  collectedCents: number;
  writeOffCents: number;
  collectionRatio: number | null;
  denialRate: number | null;
  outstanding: OutstandingClaimAging;
  outstandingClaimCount: number;
  outstandingTotalCents: number;
  payerMix: InsurancePayerMixRow[];
  aging: ArAgingBuckets;
  insuranceArCents: number;
  soonercareArCents: number;
  soonercareOutstandingCount: number;
  soonercareClaimsSubmitted: number;
  soonercareClaimsPaid: number;
  soonercareClaimsCanceled: number;
  soonercareBilledCents: number;
  soonercareCollectedCents: number;
  daysInAr: number | null;
};

function emptyAging(): ArAgingBuckets {
  return {
    under30Cents: 0,
    days31to60Cents: 0,
    days61to90Cents: 0,
    over90Cents: 0,
  };
}

function emptyOutstanding(): OutstandingClaimAging {
  return { d0Cents: 0, d30Cents: 0, d60Cents: 0, d90Cents: 0 };
}

export function emptyInsuranceMetrics(notices: string[] = []): InsuranceMetrics {
  return {
    available: false,
    claimsAvailable: false,
    balancesAvailable: false,
    notices,
    claimsSubmitted: 0,
    claimsPaid: 0,
    claimsCanceled: 0,
    billedCents: 0,
    allowedCents: 0,
    collectedCents: 0,
    writeOffCents: 0,
    collectionRatio: null,
    denialRate: null,
    outstanding: emptyOutstanding(),
    outstandingClaimCount: 0,
    outstandingTotalCents: 0,
    payerMix: [],
    aging: emptyAging(),
    insuranceArCents: 0,
    soonercareArCents: 0,
    soonercareOutstandingCount: 0,
    soonercareClaimsSubmitted: 0,
    soonercareClaimsPaid: 0,
    soonercareClaimsCanceled: 0,
    soonercareBilledCents: 0,
    soonercareCollectedCents: 0,
    daysInAr: null,
  };
}

/** Open Dental Outstanding / Manage Claims “Date Range Applies To: Date Sent”. */
function claimSentYmd(claim: ClaimRecord): string | null {
  const sent = claim.sent_at?.slice(0, 10);
  if (sent) return sent;
  return claim.date_of_service?.slice(0, 10) || null;
}

function isPaidStatus(status: string): boolean {
  return status === "received" || status === "paid";
}

function isOutstandingStatus(status: string): boolean {
  return status === "sent";
}

function inYmdRange(ymd: string | null, fromYmd: string, toYmd: string): boolean {
  if (!ymd) return false;
  return ymd >= fromYmd && ymd <= toYmd;
}

function isDeleted(deletedAt: string | null | undefined): boolean {
  return Boolean(deletedAt);
}

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function isSoonerCarePlan(name: string | null | undefined): boolean {
  return Boolean(name && SOONERCARE_PLAN.test(name));
}

/** Claim credits (estimate, payment, write-off) are often negative. */
function creditCents(
  price: Parameters<typeof moneyToCents>[0],
): number {
  return Math.abs(moneyToCents(price));
}

function daysBetween(fromIso: string, now: Date): number {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}

function outstandingBucket(days: number): keyof OutstandingClaimAging {
  if (days < 30) return "d0Cents";
  if (days < 60) return "d30Cents";
  if (days < 90) return "d60Cents";
  return "d90Cents";
}

export function summarizeInsuranceBalances(
  rows: InsuranceBalanceRecord[],
): { aging: ArAgingBuckets; insuranceArCents: number } {
  const aging = emptyAging();
  for (const row of rows) {
    aging.under30Cents += moneyToCents(row.billed_amount_under_30);
    aging.days31to60Cents += moneyToCents(row.billed_amount_31_60);
    aging.days61to90Cents += moneyToCents(row.billed_amount_61_90);
    aging.over90Cents += moneyToCents(row.billed_amount_over_90);
  }
  const insuranceArCents =
    aging.under30Cents +
    aging.days31to60Cents +
    aging.days61to90Cents +
    aging.over90Cents;
  return { aging, insuranceArCents };
}

export function daysInArFromAging(aging: ArAgingBuckets): number | null {
  const total =
    aging.under30Cents +
    aging.days31to60Cents +
    aging.days61to90Cents +
    aging.over90Cents;
  if (total <= 0) return null;
  const weighted =
    DAYS_IN_AR_MIDPOINTS.under30 * aging.under30Cents +
    DAYS_IN_AR_MIDPOINTS.days31to60 * aging.days31to60Cents +
    DAYS_IN_AR_MIDPOINTS.days61to90 * aging.days61to90Cents +
    DAYS_IN_AR_MIDPOINTS.over90 * aging.over90Cents;
  return Math.round(weighted / total);
}

export function summarizeInsuranceMetrics(input: {
  fromYmd: string;
  toYmd: string;
  claims: ClaimRecord[];
  balances: InsuranceBalanceRecord[];
  plans: InsurancePlanRecord[];
  now?: Date;
}): InsuranceMetrics {
  const notices: string[] = [];
  const now = input.now ?? new Date();
  const planName = new Map<number, string>();
  for (const plan of input.plans) {
    if (typeof plan.id === "number" && plan.name) {
      planName.set(plan.id, plan.name);
    }
  }

  const claims = input.claims.filter((c) => !isDeleted(c.deleted_at));
  const inPeriod = claims.filter((c) =>
    inYmdRange(claimSentYmd(c), input.fromYmd, input.toYmd),
  );

  let claimsSubmitted = 0;
  let claimsPaid = 0;
  let claimsCanceled = 0;
  let billedCents = 0;
  let allowedCents = 0;
  let collectedCents = 0;
  let writeOffCents = 0;
  let outstandingClaimCount = 0;
  let soonercareOutstandingCount = 0;
  let soonercareClaimsSubmitted = 0;
  let soonercareClaimsPaid = 0;
  let soonercareClaimsCanceled = 0;
  let soonercareBilledCents = 0;
  let soonercareCollectedCents = 0;
  const outstanding = emptyOutstanding();
  const payerCents = new Map<string, number>();
  let soonercareArCents = 0;

  for (const claim of inPeriod) {
    const status = normalizeStatus(claim.status);
    if (status === "draft") continue;
    claimsSubmitted += 1;
    if (isPaidStatus(status)) claimsPaid += 1;
    if (status === "canceled") claimsCanceled += 1;

    const totals = claim.totals;
    const billed = moneyToCents(totals?.amount_billed_to_insurance);
    const allowed = creditCents(totals?.estimated_insurance_payment);
    const collected = creditCents(totals?.insurance_payment);
    billedCents += billed;
    allowedCents += allowed;
    collectedCents += collected;
    writeOffCents += creditCents(totals?.write_off);

    const planId = claim.primary_insurance_plan_id;
    const label =
      (typeof planId === "number" ? planName.get(planId) : null) ?? "Other";
    if (collected > 0) {
      payerCents.set(label, (payerCents.get(label) ?? 0) + collected);
    }

    if (isSoonerCarePlan(label === "Other" ? null : label)) {
      soonercareClaimsSubmitted += 1;
      if (isPaidStatus(status)) soonercareClaimsPaid += 1;
      if (status === "canceled") soonercareClaimsCanceled += 1;
      soonercareBilledCents += billed;
      soonercareCollectedCents += collected;
    }
  }

  for (const claim of claims) {
    const status = normalizeStatus(claim.status);
    if (!isOutstandingStatus(status)) continue;
    const billed = moneyToCents(claim.totals?.amount_billed_to_insurance);
    if (billed <= 0) continue;
    outstandingClaimCount += 1;
    const ageFrom = claim.sent_at ?? claim.date_of_service ?? claim.updated_at;
    const days = ageFrom ? daysBetween(ageFrom, now) : 0;
    outstanding[outstandingBucket(days)] += billed;
    const planId = claim.primary_insurance_plan_id;
    const name = typeof planId === "number" ? planName.get(planId) : null;
    if (isSoonerCarePlan(name)) {
      soonercareArCents += billed;
      soonercareOutstandingCount += 1;
    }
  }

  const { aging, insuranceArCents } = summarizeInsuranceBalances(input.balances);
  const outstandingTotalCents =
    outstanding.d0Cents +
    outstanding.d30Cents +
    outstanding.d60Cents +
    outstanding.d90Cents;

  const claimsAvailable = claims.length > 0;
  const balancesAvailable = input.balances.length > 0;
  if (!claimsAvailable) {
    notices.push(
      "No insurance claims synced yet — ask an administrator to run a sync.",
    );
  }
  if (!balancesAvailable) {
    notices.push(
      "Insurance AR aging uses guarantor estimates until insurance balances sync.",
    );
  }

  const payerMix = [...payerCents.entries()]
    .map(([label, cents]) => ({ label, cents }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 8);

  return {
    available: claimsAvailable || balancesAvailable,
    claimsAvailable,
    balancesAvailable,
    notices,
    claimsSubmitted,
    claimsPaid,
    claimsCanceled,
    billedCents,
    allowedCents,
    collectedCents,
    writeOffCents,
    collectionRatio: allowedCents > 0 ? collectedCents / allowedCents : null,
    denialRate:
      claimsSubmitted > 0 ? claimsCanceled / claimsSubmitted : null,
    outstanding,
    outstandingClaimCount,
    outstandingTotalCents,
    payerMix,
    aging,
    insuranceArCents,
    soonercareArCents,
    soonercareOutstandingCount,
    soonercareClaimsSubmitted,
    soonercareClaimsPaid,
    soonercareClaimsCanceled,
    soonercareBilledCents,
    soonercareCollectedCents,
    daysInAr: daysInArFromAging(aging),
  };
}
