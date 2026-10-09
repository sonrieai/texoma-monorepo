import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChargeRecord, PaymentRecord, ProcedureRecord } from "./types";
import {
  productionTrendRange,
  summarizeProductionFromLedger,
} from "./production";

function charge(partial: Partial<ChargeRecord> & Pick<ChargeRecord, "id">): ChargeRecord {
  return {
    fee: { amount: "100.00" },
    procedure_code: "D6010",
    ...partial,
  };
}

function procedure(
  partial: Partial<ProcedureRecord> & Pick<ProcedureRecord, "id">,
): ProcedureRecord {
  return {
    code: "D6010",
    fee: { amount: "100.00" },
    status: "completed",
    ...partial,
  };
}

describe("productionTrendRange", () => {
  it("spans Jan 1 two years ago through today", () => {
    const now = new Date("2026-08-14T12:00:00Z");
    assert.deepEqual(productionTrendRange(now), {
      fromYmd: "2024-01-01",
      toYmd: "2026-08-14",
    });
  });
});

describe("summarizeProductionFromLedger monthlyProduction", () => {
  it("uses a fixed 3-year window, not the selected KPI period", () => {
    const year = new Date().getFullYear();
    const summary = summarizeProductionFromLedger({
      fromYmd: `${year}-08-01`,
      toYmd: `${year}-08-31`,
      procedures: [],
      charges: [
        charge({
          id: 1,
          charged_at: `${year - 2}-05-15T10:00:00Z`,
          fee: { amount: "1000.00" },
        }),
        charge({
          id: 2,
          charged_at: `${year - 1}-05-15T10:00:00Z`,
          fee: { amount: "2000.00" },
        }),
        charge({
          id: 3,
          charged_at: `${year}-08-10T10:00:00Z`,
          fee: { amount: "3000.00" },
        }),
        charge({
          id: 4,
          charged_at: `${year - 3}-12-01T10:00:00Z`,
          fee: { amount: "9000.00" },
        }),
      ],
      payments: [],
      adjustments: [],
    });

    const years = summary.monthlyProduction.map((s) => s.year);
    assert.deepEqual(years, [year - 2, year - 1, year]);

    const yPrior2 = summary.monthlyProduction.find((s) => s.year === year - 2);
    const yPrior1 = summary.monthlyProduction.find((s) => s.year === year - 1);
    const yCurrent = summary.monthlyProduction.find((s) => s.year === year);

    assert.equal(yPrior2?.months[4], 1000);
    assert.equal(yPrior1?.months[4], 2000);
    assert.equal(yCurrent?.months[7], 3000);
    assert.equal(
      yPrior2?.months.every((v, i) => (i === 4 ? v === 1000 : v === 0)),
      true,
    );

    assert.equal(summary.grossProductionCents, 300_000);
  });

  it("falls back to procedure dates inside the trend window", () => {
    const year = new Date().getFullYear();
    const summary = summarizeProductionFromLedger({
      fromYmd: `${year}-08-01`,
      toYmd: `${year}-08-31`,
      procedures: [
        procedure({
          id: 1,
          start_date: `${year - 1}-03-01`,
          fee: { amount: "500.00" },
        }),
      ],
      charges: [],
      payments: [],
      adjustments: [],
    });

    const yPrior1 = summary.monthlyProduction.find((s) => s.year === year - 1);
    assert.equal(yPrior1?.months[2], 500);
  });
});

describe("summarizeProductionFromLedger periodTrend", () => {
  it("keeps only the selected month, one point per day", () => {
    const year = new Date().getFullYear();
    const summary = summarizeProductionFromLedger({
      fromYmd: `${year}-08-01`,
      toYmd: `${year}-08-03`,
      procedures: [],
      charges: [
        charge({
          id: 1,
          charged_at: `${year - 1}-05-15T10:00:00Z`,
          fee: { amount: "9000.00" },
        }),
        charge({
          id: 2,
          charged_at: `${year}-08-02T10:00:00Z`,
          fee: { amount: "3000.00" },
        }),
        charge({
          id: 3,
          charged_at: `${year}-09-01T10:00:00Z`,
          fee: { amount: "4000.00" },
        }),
      ],
      payments: [],
      adjustments: [],
    });

    assert.deepEqual(
      summary.periodTrend.map((point) => point.label),
      ["1", "2", "3"],
    );
    assert.equal(summary.periodTrend[1]?.dollars, 3000);
    assert.equal(summary.periodTrend[0]?.dollars, 0);
    assert.equal(summary.treatmentByMonth.length, 1);
    assert.equal(summary.treatmentByMonth[0]?.label, "Aug");
  });

  it("uses one point for a single day", () => {
    const summary = summarizeProductionFromLedger({
      fromYmd: "2026-10-06",
      toYmd: "2026-10-06",
      procedures: [],
      charges: [
        charge({
          id: 1,
          charged_at: "2026-10-06T15:00:00Z",
          fee: { amount: "125.00" },
        }),
        charge({
          id: 2,
          charged_at: "2026-10-05T15:00:00Z",
          fee: { amount: "999.00" },
        }),
      ],
      payments: [],
      adjustments: [],
    });

    assert.equal(summary.periodTrend.length, 1);
    assert.equal(summary.periodTrend[0]?.label, "Oct 6");
    assert.equal(summary.periodTrend[0]?.dollars, 125);
    assert.equal(summary.treatmentByMonth[0]?.label, "Oct 6");
  });
});

describe("summarizeProductionFromLedger collections", () => {
  it("nets payment reversals into collections", () => {
    const summary = summarizeProductionFromLedger({
      fromYmd: "2025-12-01",
      toYmd: "2026-01-31",
      procedures: [],
      charges: [
        charge({
          id: 1,
          charged_at: "2026-01-13",
          fee: { amount: "1633.00" },
        }),
      ],
      payments: [
        {
          id: 1,
          paid_at: "2025-12-13",
          payment_amount: { amount: "0.00" },
        },
        {
          id: 2,
          paid_at: "2025-12-14",
          payment_amount: { amount: "-75.00" },
          description: "Miscellaneous credit",
        },
        {
          id: 3,
          paid_at: "2025-12-15",
          payment_amount: { amount: "-80.00" },
          description: "Miscellaneous credit",
        },
      ] satisfies PaymentRecord[],
      adjustments: [],
    });

    assert.equal(summary.collectionsCents, -15_500);
    assert.ok(summary.collectionRatio != null && summary.collectionRatio < 0);
  });
});
