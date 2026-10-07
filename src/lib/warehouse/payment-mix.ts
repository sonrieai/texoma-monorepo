import type { ClaimRecord, PaymentRecord } from "@/lib/warehouse/types";
import { moneyToCents } from "@/lib/warehouse/types";
import { inYmdRange } from "@/lib/warehouse/conversion";

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
  /\b(care\s*credit|carecredit|cherry|sunbit|proceed|lending|financ|payment plan|hfd|varidi|lending point)\b/i;
const SOONERCARE_PATTERN =
  /\b(sooner\s*care|soonercare|medicaid|sooner|dentaquest|liberty dental|choctaw|icare)\b/i;
const INSURANCE_PATTERN =
  /\b(insurance|ins\b|eob|claim|delta|aetna|cigna|uhc|united|bcbs|metlife|guardian|humana)\b/i;
const CASH_PATTERN =
  /\b(cash|check|credit card|debit|visa|mastercard|amex|discover|patient pay|self pay|message-to-pay)\b/i;

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

export type PaymentClassificationOptions = {
  insurancePaymentTypeDefNums?: ReadonlySet<number>;
  soonercarePaymentTypeDefNums?: ReadonlySet<number>;
  financedPaymentTypeDefNums?: ReadonlySet<number>;
  cashPaymentTypeDefNums?: ReadonlySet<number>;
};

function bucketFromPayTypeId(
  typeId: number,
  options?: PaymentClassificationOptions,
): PaymentMixBucket | null {
  if (options?.insurancePaymentTypeDefNums?.has(typeId)) return "insurance";
  if (options?.soonercarePaymentTypeDefNums?.has(typeId)) return "soonercare";
  if (options?.financedPaymentTypeDefNums?.has(typeId)) return "financed";
  if (options?.cashPaymentTypeDefNums?.has(typeId)) return "cash";
  return null;
}

export function classifyPayment(
  p: PaymentRecord,
  options?: PaymentClassificationOptions,
): PaymentMixBucket | "unknown" {
  if (isInsurancePayment(p)) {
    return "insurance";
  }

  const typeId = p.payment_type_id;
  if (typeof typeId === "number" && typeId > 0) {
    const fromDef = bucketFromPayTypeId(typeId, options);
    if (fromDef) return fromDef;
  }

  if (
    (typeId === 0 || typeId == null) &&
    !p.payment_type?.trim() &&
    p.patient_id != null &&
    p.patient_id > 0
  ) {
    return "cash";
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
  options?: PaymentClassificationOptions,
): FinancingVendorKey | null {
  if (classifyPayment(p, options) !== "financed") return null;
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

/** When paysplits lack insurance PayTypes, align mix with claim receipts in range. */
export function supplementInsurancePaymentMixFromClaims(
  mix: PaymentMix,
  claims: ClaimRecord[],
  fromYmd: string,
  toYmd: string,
): { mix: PaymentMix; supplementedCents: number } {
  let claimInsCents = 0;
  for (const claim of claims) {
    if (claim.status !== "received") continue;
    const received = claim.received_at ?? claim.updated_at;
    if (!inYmdRange(received, fromYmd, toYmd)) continue;
    claimInsCents += moneyToCents(claim.totals?.insurance_payment);
  }
  if (claimInsCents <= mix.insurance) {
    return { mix, supplementedCents: 0 };
  }
  const delta = claimInsCents - mix.insurance;
  return {
    mix: {
      ...mix,
      insurance: claimInsCents,
      totalCents: mix.totalCents + delta,
    },
    supplementedCents: delta,
  };
}

export function aggregatePaymentMix(
  payments: PaymentRecord[],
  options?: PaymentClassificationOptions,
): PaymentMix {
  const mix = emptyPaymentMix();
  for (const p of payments) {
    const cents = paymentCollectionCents(p);
    if (cents <= 0) continue;
    mix.totalCents += cents;
    const bucket = classifyPayment(p, options);
    if (bucket === "unknown") mix.unknownCents += cents;
    else mix[bucket] += cents;
  }
  return mix;
}

export function aggregateFinancingVendorMix(
  payments: PaymentRecord[],
  options?: PaymentClassificationOptions,
): FinancingVendorMix {
  const mix = emptyFinancingVendorMix();
  for (const p of payments) {
    const vendor = classifyFinancingVendor(p, options);
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
