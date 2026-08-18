import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NexGuarantorBalance } from "./client";
import { emptyArSummary, summarizeArFromBalances } from "./ar";

function price(amount: string) {
  return { amount };
}

function balance(
  partial: Partial<NexGuarantorBalance> & {
    total_balance: { amount: string };
  },
): NexGuarantorBalance {
  return partial;
}

describe("summarizeArFromBalances", () => {
  it("sums guarantor_portion and insurance_estimate as responsible-party AR", () => {
    const summary = summarizeArFromBalances([
      balance({
        total_balance: price("100.00"),
        total_balance_under_30: price("40.00"),
        total_balance_31_60: price("30.00"),
        total_balance_61_90: price("20.00"),
        total_balance_over_90: price("10.00"),
        guarantor_portion: price("60.00"),
        insurance_estimate: price("40.00"),
      }),
      balance({
        total_balance: price("50.00"),
        total_balance_over_90: price("5.00"),
        guarantor_portion: price("15.00"),
        insurance_estimate: price("35.00"),
      }),
    ]);

    assert.equal(summary.available, true);
    assert.equal(summary.guarantorCount, 2);
    assert.equal(summary.totalArCents, 15000);
    assert.equal(summary.patientArCents, 7500);
    assert.equal(summary.insuranceArCents, 7500);
    assert.equal(summary.arOver90Cents, 1500);
    assert.equal(summary.aging.under30Cents, 4000);
    assert.equal(summary.aging.days31to60Cents, 3000);
    assert.equal(summary.arOver90Ratio, 0.1);
  });

  it("treats missing portion fields as zero", () => {
    const summary = summarizeArFromBalances([
      balance({ total_balance: price("20.00") }),
    ]);
    assert.equal(summary.patientArCents, 0);
    assert.equal(summary.insuranceArCents, 0);
    assert.equal(summary.totalArCents, 2000);
  });
});

describe("emptyArSummary", () => {
  it("includes responsible-party fields at zero", () => {
    const empty = emptyArSummary(["unavailable"]);
    assert.equal(empty.available, false);
    assert.equal(empty.patientArCents, 0);
    assert.equal(empty.insuranceArCents, 0);
    assert.deepEqual(empty.notices, ["unavailable"]);
  });
});
