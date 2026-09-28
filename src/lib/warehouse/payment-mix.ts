import type { PaymentRecord } from "@/lib/warehouse/types";
import { moneyToCents } from "@/lib/warehouse/types";

export type PaymentMixBucket = "cash" | "insurance" | "financed" | "soonercare";

export type PaymentMix = Record<PaymentMixBucket, number> & {
  unknownCents: number;
  totalCents: number;
};

export type FinancingVendorKey =
  | "careCredit"
  | "cherry"
  | "sunbit"
  | "proceed"
  | "other";

export type FinancingVendorMix = Record<FinancingVendorKey, number> & {
  totalCents: number;
};

export const FINANCING_VENDOR_LABELS: Record<FinancingVendorKey, string> = {
  careCredit: "Care Credit",
  cherry: "Cherry",
  sunbit: "Sunbit",
  proceed: "Proceed",
  other: "Other",
};

const FINANCED_PATTERN =
  /\b(care\s*credit|carecredit|cherry|sunbit|proceed|lending|financ|payment plan)\b/i;
const SOONERCARE_PATTERN =
  /\b(sooner\s*care|soonercare|medicaid|sooner)\b/i;
const INSURANCE_PATTERN =
  /\b(insurance|ins\b|eob|claim|delta|aetna|cigna|uhc|united|bcbs|metlife|guardian|humana)\b/i;
const CASH_PATTERN =
  /\b(cash|check|credit card|debit|visa|mastercard|amex|discover|patient pay|self pay)\b/i;

const VENDOR_PATTERNS: { key: FinancingVendorKey; pattern: RegExp }[] = [
  { key: "careCredit", pattern: /\b(care\s*credit|carecredit)\b/i },
  { key: "cherry", pattern: /\bcherry\b/i },
  { key: "sunbit", pattern: /\bsunbit\b/i },
  { key: "proceed", pattern: /\bproceed\b/i },
];

function paymentHaystack(p: PaymentRecord): string {
  const parts = [
    p.payment_type,
    p.type,
    p.description,
    p.notes,
    typeof p.payment_method === "string" ? p.payment_method : null,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function positiveId(value: number | null | undefined): boolean {
  return typeof value === "number" && value > 0;
}

/** Insurance signal from source payment row (claim_id is the live API field). */
export function isInsurancePayment(p: PaymentRecord): boolean {
  if (positiveId(p.claim_id) || positiveId(p.insurance_claim_id)) {
    return true;
  }
  return positiveId(p.insurance_plan_id);
}

export function classifyPayment(p: PaymentRecord): PaymentMixBucket | "unknown" {
  if (isInsurancePayment(p)) {
    return "insurance";
  }

  const hay = paymentHaystack(p);
  if (SOONERCARE_PATTERN.test(hay)) return "soonercare";
  if (FINANCED_PATTERN.test(hay)) return "financed";
  if (INSURANCE_PATTERN.test(hay)) return "insurance";
  if (CASH_PATTERN.test(hay)) return "cash";

  return "unknown";
}

export function classifyFinancingVendor(
  p: PaymentRecord,
): FinancingVendorKey | null {
  if (classifyPayment(p) !== "financed") return null;
  const hay = paymentHaystack(p);
  for (const vendor of VENDOR_PATTERNS) {
    if (vendor.pattern.test(hay)) return vendor.key;
  }
  return "other";
}

export function emptyPaymentMix(): PaymentMix {
  return {
    cash: 0,
    insurance: 0,
    financed: 0,
    soonercare: 0,
    unknownCents: 0,
    totalCents: 0,
  };
}

export function emptyFinancingVendorMix(): FinancingVendorMix {
  return {
    careCredit: 0,
    cherry: 0,
    sunbit: 0,
    proceed: 0,
    other: 0,
    totalCents: 0,
  };
}

/** Positive payment amounts only — matches payment-mix donuts and collection ratio KPI. */
export function paymentCollectionCents(p: PaymentRecord): number {
  const cents = moneyToCents(p.payment_amount);
  return cents > 0 ? cents : 0;
}

export function aggregatePaymentMix(payments: PaymentRecord[]): PaymentMix {
  const mix = emptyPaymentMix();
  for (const p of payments) {
    const cents = paymentCollectionCents(p);
    if (cents <= 0) continue;
    mix.totalCents += cents;
    const bucket = classifyPayment(p);
    if (bucket === "unknown") mix.unknownCents += cents;
    else mix[bucket] += cents;
  }
  return mix;
}

export function aggregateFinancingVendorMix(
  payments: PaymentRecord[],
): FinancingVendorMix {
  const mix = emptyFinancingVendorMix();
  for (const p of payments) {
    const vendor = classifyFinancingVendor(p);
    if (!vendor) continue;
    const cents = paymentCollectionCents(p);
    if (cents <= 0) continue;
    mix[vendor] += cents;
    mix.totalCents += cents;
  }
  return mix;
}

/** Donut slices in mockup order (dollars). Omits zero vendors. */
export function financingVendorDonutSlices(
  mix: FinancingVendorMix,
): { label: string; value: number }[] {
  const order: FinancingVendorKey[] = [
    "careCredit",
    "cherry",
    "sunbit",
    "proceed",
    "other",
  ];
  return order
    .filter((key) => mix[key] > 0)
    .map((key) => ({
      label: FINANCING_VENDOR_LABELS[key],
      value: mix[key] / 100,
    }));
}
