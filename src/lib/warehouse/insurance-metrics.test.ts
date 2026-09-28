import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysInArFromAging,
  summarizeInsuranceBalances,
  summarizeInsuranceMetrics,
} from "./insurance-metrics";
import type {
  ClaimRecord,
  InsuranceBalanceRecord,
  InsurancePlanRecord,
} from "./types";

function price(amount: string) {
  return { amount };
}

describe("summarizeInsuranceBalances", () => {
  it("sums billed aging buckets as insurance AR", () => {
    const rows: InsuranceBalanceRecord[] = [
      {
        billed_amount_under_30: price("62.00"),
        billed_amount_31_60: price("24.00"),
        billed_amount_61_90: price("11.00"),
        billed_amount_over_90: price("8.00"),
      },
    ];
    const { aging, insuranceArCents } = summarizeInsuranceBalances(rows);
    assert.equal(aging.under30Cents, 6200);
    assert.equal(insuranceArCents, 10500);
    assert.equal(daysInArFromAging(aging), 35);
  });
});

describe("summarizeInsuranceMetrics", () => {
  it("counts submitted/paid/canceled in period and outstanding sent claims", () => {
    const plans: InsurancePlanRecord[] = [
      { id: 1, name: "Delta Dental" },
      { id: 2, name: "SoonerCare" },
    ];
    const claims: ClaimRecord[] = [
      {
        status: "received",
        date_of_service: "2026-06-10",
        primary_insurance_plan_id: 1,
        totals: {
          amount_billed_to_insurance: price("200.00"),
          estimated_insurance_payment: price("180.00"),
          insurance_payment: price("170.00"),
          write_off: price("20.00"),
        },
      },
      {
        status: "sent",
        date_of_service: "2026-06-12",
        sent_at: "2026-06-12T00:00:00Z",
        primary_insurance_plan_id: 2,
        totals: { amount_billed_to_insurance: price("50.00") },
      },
      {
        status: "canceled",
        date_of_service: "2026-06-15",
        totals: { amount_billed_to_insurance: price("10.00") },
      },
      {
        status: "draft",
        date_of_service: "2026-06-16",
      },
      {
        status: "received",
        date_of_service: "2025-01-01",
        totals: { insurance_payment: price("999.00") },
      },
    ];
    const summary = summarizeInsuranceMetrics({
      fromYmd: "2026-06-01",
      toYmd: "2026-06-30",
      claims,
      balances: [],
      plans,
      now: new Date("2026-07-20T00:00:00Z"),
    });
    assert.equal(summary.claimsSubmitted, 3);
    assert.equal(summary.claimsPaid, 1);
    assert.equal(summary.claimsCanceled, 1);
    assert.equal(summary.collectedCents, 17000);
    assert.equal(summary.payerMix[0]?.label, "Delta Dental");
    assert.equal(summary.outstanding.d30Cents, 5000);
    assert.equal(summary.outstandingClaimCount, 1);
    assert.equal(summary.soonercareArCents, 5000);
    assert.equal(summary.soonercareClaimsSubmitted, 1);
    assert.equal(summary.soonercareOutstandingCount, 1);
    assert.equal(summary.denialRate, 1 / 3);
  });

  it("counts Date Sent and treats paid as paid, matching OD outstanding unpaid sent", () => {
    const claims: ClaimRecord[] = [
      {
        status: "sent",
        date_of_service: "2025-12-13",
        sent_at: "2026-01-13T00:00:00Z",
        primary_insurance_plan_id: 19,
        totals: { amount_billed_to_insurance: price("180.00") },
      },
      {
        status: "sent",
        date_of_service: "2025-12-13",
        sent_at: "2026-01-13T00:00:00Z",
        totals: { amount_billed_to_insurance: price("68.00") },
      },
      {
        status: "paid",
        date_of_service: "2025-12-13",
        sent_at: "2026-01-13T00:00:00Z",
        primary_insurance_plan_id: 19,
        totals: {
          amount_billed_to_insurance: price("300.00"),
          estimated_insurance_payment: price("-150.00"),
          insurance_payment: price("-150.00"),
        },
      },
      {
        status: "paid",
        date_of_service: "2025-10-07",
        sent_at: "2025-10-07T00:00:00Z",
        totals: {
          amount_billed_to_insurance: price("80.00"),
          insurance_payment: price("-80.00"),
        },
      },
      {
        status: "draft",
        date_of_service: "2026-01-16",
      },
      {
        status: "sent",
        date_of_service: "2026-01-14",
        sent_at: "2026-01-13T00:00:00Z",
        totals: { amount_billed_to_insurance: price("0.00") },
      },
    ];
    const summary = summarizeInsuranceMetrics({
      fromYmd: "2026-01-01",
      toYmd: "2026-08-17",
      claims,
      balances: [],
      plans: [{ id: 19, name: "Medicaid" }],
      now: new Date("2026-08-17T00:00:00Z"),
    });
    assert.equal(summary.claimsSubmitted, 4);
    assert.equal(summary.claimsPaid, 1);
    assert.equal(summary.collectedCents, 15000);
    assert.equal(summary.allowedCents, 15000);
    assert.equal(summary.payerMix[0]?.label, "Medicaid");
    assert.equal(summary.outstandingClaimCount, 2);
    assert.equal(summary.outstandingTotalCents, 24800);
    assert.equal(summary.soonercareClaimsSubmitted, 2);
    assert.equal(summary.soonercareClaimsPaid, 1);
    assert.equal(summary.soonercareCollectedCents, 15000);
    assert.equal(summary.soonercareOutstandingCount, 1);
    assert.equal(summary.soonercareArCents, 18000);
  });
});
