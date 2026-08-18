import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INSURANCE_SECTIONS,
  agingHeatAlpha,
  arAgingDetailRows,
  arAgingTotalCents,
  insuranceCollectionsTrend,
  insurancePayerMixSlices,
} from "./insurance";
import { emptyPaymentMix } from "../nexhealth/payment-mix";

describe("INSURANCE_SECTIONS", () => {
  it("matches mockup section order", () => {
    assert.deepEqual([...INSURANCE_SECTIONS], [
      "Cockpit Metrics",
      "Claims Pipeline",
      "Outstanding Claims",
      "Insurance AR Aging",
      "Collections Trend",
      "SoonerCare",
    ]);
  });
});

describe("arAgingDetailRows", () => {
  it("computes share of each bucket", () => {
    const aging = {
      under30Cents: 62000_00,
      days31to60Cents: 24000_00,
      days61to90Cents: 11000_00,
      over90Cents: 8000_00,
    };
    const rows = arAgingDetailRows(aging);
    assert.equal(arAgingTotalCents(aging), 105000_00);
    assert.equal(rows[0]?.label, "0–30 days");
    assert.equal(rows[0]?.cents, 62000_00);
    assert.ok(Math.abs((rows[0]?.share ?? 0) - 62000 / 105000) < 1e-9);
    assert.equal(agingHeatAlpha(62000_00, 62000_00), 0.39);
  });
});

describe("insurancePayerMixSlices", () => {
  it("omits empty buckets", () => {
    const mix = emptyPaymentMix();
    mix.insurance = 105000_00;
    mix.soonercare = 42000_00;
    mix.totalCents = 147000_00;
    const slices = insurancePayerMixSlices(mix);
    assert.deepEqual(
      slices.map((s) => s.label),
      ["Insurance", "SoonerCare"],
    );
    assert.equal(slices[0]?.value, 105000);
  });
});

describe("insuranceCollectionsTrend", () => {
  it("aligns collections months to production series dollars", () => {
    const trend = insuranceCollectionsTrend(
      [
        { label: "May", monthKey: "2026-05", cents: 158000_00 },
        { label: "Jun", monthKey: "2026-06", cents: 147000_00 },
      ],
      [
        {
          label: "2026",
          year: 2026,
          months: [0, 0, 0, 0, 162000, 151000, 0, 0, 0, 0, 0, 0],
        },
      ],
    );
    assert.deepEqual(trend.xLabels, ["May", "Jun"]);
    assert.deepEqual(trend.production, [162000, 151000]);
    assert.deepEqual(trend.collected, [158000, 147000]);
  });
});
