import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHANNEL_COLORS } from "@/lib/types/viz";
import { productionGrowthLines } from "./production-trend";

const monthly = [
  { year: 2024, months: Array.from({ length: 12 }, () => 999) },
  { year: 2025, months: Array.from({ length: 12 }, (_, i) => (i + 1) * 100) },
  { year: 2026, months: Array.from({ length: 12 }, (_, i) => (i + 1) * 10) },
];

describe("productionGrowthLines", () => {
  it("plots each year on the same months and stops the current year early", () => {
    const trend = productionGrowthLines(monthly, new Date(2026, 9, 9));

    assert.deepEqual(trend.xLabels, [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
    assert.deepEqual(
      trend.series.map((row) => row.label),
      ["2024", "2025", "2026"],
    );
    assert.equal(trend.series[0]?.values[0], 999);
    assert.equal(trend.series[0]?.values[11], 999);
    assert.equal(trend.series[1]?.values[0], 100);
    assert.equal(trend.series[1]?.values[11], 1200);
    assert.equal(trend.series[2]?.values[0], 10);
    assert.equal(trend.series[2]?.values[8], 90);
    assert.equal(trend.series[2]?.values[9], null);
    assert.equal(trend.series[2]?.values[11], null);
    assert.equal(trend.series[2]?.color, CHANNEL_COLORS[0]);
    assert.equal(trend.subtitle, "2024 · 2025 · 2026 through Sep");
  });

  it("includes the current month once that month has ended", () => {
    const trend = productionGrowthLines(monthly, new Date(2026, 9, 31));

    assert.equal(trend.series[2]?.values[9], 100);
    assert.equal(trend.series[2]?.values[10], null);
    assert.equal(trend.subtitle, "2024 · 2025 · 2026 through Oct");
  });

  it("omits the new year until it has a complete month", () => {
    const trend = productionGrowthLines(monthly, new Date(2026, 0, 15));

    assert.deepEqual(
      trend.series.map((row) => row.label),
      ["2024", "2025"],
    );
    assert.equal(trend.series[1]?.values[11], 1200);
    assert.equal(trend.subtitle, "2024 · 2025");
  });
});
