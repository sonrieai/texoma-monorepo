/**
 * PHI-safe accounts receivable aggregates from guarantor balances.
 */

import {
  listGuarantorBalances,
  nexPriceToCents,
  type NexGuarantorBalance,
} from "@/lib/nexhealth/client";

export type ArAgingBuckets = {
  under30Cents: number;
  days31to60Cents: number;
  days61to90Cents: number;
  over90Cents: number;
};

export type ArSummary = {
  available: boolean;
  totalArCents: number;
  arOver90Cents: number;
  arOver90Ratio: number | null;
  guarantorCount: number;
  aging: ArAgingBuckets;
  /** Sum of guarantor_portion (patient-responsible balances). */
  patientArCents: number;
  /** Sum of insurance_estimate (payer-responsible balances). */
  insuranceArCents: number;
  notices: string[];
};

function emptyAging(): ArAgingBuckets {
  return {
    under30Cents: 0,
    days31to60Cents: 0,
    days61to90Cents: 0,
    over90Cents: 0,
  };
}

export function emptyArSummary(notices: string[] = []): ArSummary {
  return {
    available: false,
    totalArCents: 0,
    arOver90Cents: 0,
    arOver90Ratio: null,
    guarantorCount: 0,
    aging: emptyAging(),
    patientArCents: 0,
    insuranceArCents: 0,
    notices,
  };
}

/** Aggregate guarantor balance rows (live API or warehouse `raw`). */
export function summarizeArFromBalances(
  rows: NexGuarantorBalance[],
  notices: string[] = [],
): ArSummary {
  let totalArCents = 0;
  let arOver90Cents = 0;
  let patientArCents = 0;
  let insuranceArCents = 0;
  const aging = emptyAging();

  for (const row of rows) {
    totalArCents += nexPriceToCents(row.total_balance);
    arOver90Cents += nexPriceToCents(row.total_balance_over_90);
    aging.under30Cents += nexPriceToCents(row.total_balance_under_30);
    aging.days31to60Cents += nexPriceToCents(row.total_balance_31_60);
    aging.days61to90Cents += nexPriceToCents(row.total_balance_61_90);
    aging.over90Cents += nexPriceToCents(row.total_balance_over_90);
    patientArCents += nexPriceToCents(row.guarantor_portion);
    insuranceArCents += nexPriceToCents(row.insurance_estimate);
  }

  return {
    available: true,
    totalArCents,
    arOver90Cents,
    arOver90Ratio: totalArCents > 0 ? arOver90Cents / totalArCents : null,
    guarantorCount: rows.length,
    aging,
    patientArCents,
    insuranceArCents,
    notices,
  };
}

function nexTsToIso(nexTs: string): string {
  if (nexTs.endsWith("Z")) return nexTs;
  return nexTs.replace(/\+0000$/, "Z").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

export async function loadArSummary(range: {
  start: string;
}): Promise<ArSummary> {
  const updatedSince = nexTsToIso(range.start);

  try {
    const rows = await listGuarantorBalances({
      updatedSince,
      maxPages: 5,
    });

    const notices: string[] = [];
    if (rows.length === 0) {
      notices.push(
        "No guarantor balances returned (sandbox may lack AR sync or all balances are zero).",
      );
    }

    return summarizeArFromBalances(rows, notices);
  } catch (e) {
    return emptyArSummary([
      `Guarantor balances unavailable (${e instanceof Error ? e.message : "request failed"}).`,
    ]);
  }
}
