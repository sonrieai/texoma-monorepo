import type { OdDefinitionRow } from "@/lib/opendental/types";

const SOONERCARE_PAYMENT_PATTERN =
  /\b(sooner\s*care|soonercare|medicaid|dentaquest|liberty dental|choctaw|icare)\b/i;

const INSURANCE_PAYMENT_PATTERN =
  /\b(insurance|ins\.?\s*check|ins check|eob|received ins|ins claim)\b/i;

const FINANCED_PAYMENT_PATTERN =
  /\b(care\s*credit|carecredit|cherry|sunbit|proceed|lending|financ|payment plan|hfd|varidi)\b/i;

const CASH_PAYMENT_PATTERN =
  /\b(cash|check|credit card|debit|visa|mastercard|amex|discover|patient pay|self pay|message-to-pay)\b/i;

export type PaymentTypeDefMaps = {
  insurance: Set<number>;
  soonercare: Set<number>;
  financed: Set<number>;
  cash: Set<number>;
};

function classifyPayTypeName(name: string): keyof PaymentTypeDefMaps | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (SOONERCARE_PAYMENT_PATTERN.test(trimmed)) return "soonercare";
  if (INSURANCE_PAYMENT_PATTERN.test(trimmed)) return "insurance";
  if (FINANCED_PAYMENT_PATTERN.test(trimmed)) return "financed";
  if (CASH_PAYMENT_PATTERN.test(trimmed)) return "cash";
  return null;
}

/** PayType DefNums (category 10) → payment mix bucket. */
export function buildPaymentTypeDefMaps(
  defs: OdDefinitionRow[],
): PaymentTypeDefMaps {
  const maps: PaymentTypeDefMaps = {
    insurance: new Set(),
    soonercare: new Set(),
    financed: new Set(),
    cash: new Set(),
  };

  for (const row of defs) {
    const name = row.ItemName?.trim() || "";
    if (!name || row.IsHidden) continue;
    const bucket = classifyPayTypeName(name);
    if (bucket) maps[bucket].add(row.DefNum);
  }

  return maps;
}

/** PayType DefNums that classify paysplits as insurance (excludes Medicaid plan pay types). */
export function insurancePaymentTypeDefNums(
  defs: OdDefinitionRow[],
): Set<number> {
  return buildPaymentTypeDefMaps(defs).insurance;
}
