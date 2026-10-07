import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPeriodState,
  parsePeriodParams,
  periodToRange,
  periodToSearchString,
  todayYmd,
} from "./period";

describe("defaultPeriodState", () => {
  it("defaults to the current year through today", () => {
    const now = new Date(2026, 7, 19);
    const state = defaultPeriodState(now);
    assert.equal(state.mode, "yearly");
    assert.equal(state.year, "2026");
    assert.deepEqual(periodToRange(state, now), {
      start: "2026-01-01",
      end: "2026-08-19",
    });
  });
});

describe("parsePeriodParams", () => {
  it("uses the current year when no query params are present", () => {
    const parsed = parsePeriodParams({});
    const expected = defaultPeriodState();
    assert.equal(parsed.mode, "yearly");
    assert.equal(parsed.year, expected.year);
  });

  it("keeps an explicit monthly period", () => {
    const parsed = parsePeriodParams({ period: "monthly", month: "2026-03" });
    assert.equal(parsed.mode, "monthly");
    assert.equal(parsed.month, "2026-03");
    assert.deepEqual(periodToRange(parsed), {
      start: "2026-03-01",
      end: "2026-03-31",
    });
  });

  it("treats a this-year date range as yearly", () => {
    const today = todayYmd();
    const parsed = parsePeriodParams({
      period: "range",
      from: `${today.slice(0, 4)}-01-01`,
      to: today,
    });
    assert.equal(parsed.mode, "yearly");
    assert.equal(parsed.year, today.slice(0, 4));
  });

  it("keeps a custom date range", () => {
    const parsed = parsePeriodParams({
      period: "range",
      from: "2026-04-01",
      to: "2026-06-30",
    });
    assert.equal(parsed.mode, "range");
    assert.deepEqual(periodToRange(parsed), {
      start: "2026-04-01",
      end: "2026-06-30",
    });
  });
});

describe("periodToSearchString", () => {
  it("serializes a yearly period", () => {
    const qs = periodToSearchString({
      mode: "yearly",
      day: "2026-08-19",
      month: "2026-08",
      year: "2026",
      from: "2026-01-01",
      to: "2026-08-19",
    });
    const params = new URLSearchParams(qs);
    assert.equal(params.get("period"), "yearly");
    assert.equal(params.get("year"), "2026");
    assert.equal(params.get("from"), null);
  });
});
