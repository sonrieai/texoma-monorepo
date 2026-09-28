import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { __testSumSpendFromPayload } from "@/lib/ghl/ad-spend";

describe("GHL ad spend payload parsing", () => {
  it("sums Facebook spend from nested period rows", () => {
    const payload = {
      data: [
        { month: "2026-01", spend: 1200 },
        { month: "2026-02", spend: 800.5 },
      ],
    };
    assert.equal(
      __testSumSpendFromPayload(payload, ["spend", "cost"]),
      2000.5,
    );
  });

  it("converts Google cost_micros to dollars", () => {
    const payload = {
      results: [{ cost_micros: 1_500_000 }, { cost_micros: "2500000" }],
    };
    assert.equal(
      __testSumSpendFromPayload(payload, ["cost_micros", "spend"]),
      4,
    );
  });

  it("returns 0 for empty payloads", () => {
    assert.equal(__testSumSpendFromPayload({}, ["spend"]), 0);
    assert.equal(__testSumSpendFromPayload(null, ["spend"]), 0);
  });
});
