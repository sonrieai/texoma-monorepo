import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateFinancingVendorMix,
  classifyFinancingVendor,
  classifyPayment,
  financingVendorDonutSlices,
  isInsurancePayment,
} from "./payment-mix";
import type { NexPayment } from "./client";

function payment(description: string, amount: string): NexPayment {
  return { description, payment_amount: { amount } };
}

describe("classifyPayment insurance", () => {
  it("uses claim_id from NexHealth v3 payloads", () => {
    assert.equal(
      classifyPayment({
        claim_id: 689977577,
        payment_amount: { amount: "100.00" },
      }),
      "insurance",
    );
    assert.equal(isInsurancePayment({ claim_id: 1 }), true);
  });

  it("still accepts legacy insurance_claim_id", () => {
    assert.equal(
      classifyPayment({
        insurance_claim_id: 42,
        payment_amount: { amount: "50.00" },
      }),
      "insurance",
    );
  });

  it("classifies insurance_plan_id without claim", () => {
    assert.equal(
      classifyPayment({
        insurance_plan_id: 55522718,
        payment_amount: { amount: "25.00" },
      }),
      "insurance",
    );
  });
});

describe("payment-mix financing vendors", () => {
  it("splits financed payments by vendor", () => {
    const payments: NexPayment[] = [
      payment("CareCredit patient financing", "620.00"),
      payment("Cherry payment plan", "380.00"),
      payment("Sunbit checkout", "240.00"),
      payment("Proceed Finance", "140.00"),
      payment("Cash patient pay", "100.00"),
    ];
    const mix = aggregateFinancingVendorMix(payments);
    assert.equal(mix.careCredit, 62000);
    assert.equal(mix.cherry, 38000);
    assert.equal(mix.sunbit, 24000);
    assert.equal(mix.proceed, 14000);
    assert.equal(mix.totalCents, 138000);
    assert.equal(classifyFinancingVendor(payments[0]), "careCredit");
    const slices = financingVendorDonutSlices(mix);
    assert.equal(slices.length, 4);
    assert.equal(slices[0]?.label, "Care Credit");
  });
});
