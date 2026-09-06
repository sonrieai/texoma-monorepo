import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPeriodState,
  parsePeriodParams,
  periodToRange,
  periodToSearchString,
  rangePreset,
} from "./period";

describe("defaultPeriodState", () => {
  it("defaults to this-year date range", () => {
    const now = new Date(2026, 7, 19);
    const state = defaultPeriodState(now);
    const thisYear = rangePreset("thisYear", now);
    assert.equal(state.mode, "range");
    assert.equal(state.from, thisYear.from);
    assert.equal(state.to, thisYear.to);
    assert.equal(state.from, "2026-01-01");
    assert.equal(state.to, "2026-08-19");
  });
});

describe("parsePeriodParams", () => {
  it("uses this-year range when no query params are present", () => {
    const parsed = parsePeriodParams({});
    const expected = defaultPeriodState();
    assert.equal(parsed.mode, "range");
    assert.equal(parsed.from, expected.from);
    assert.equal(parsed.to, expected.to);
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
});

describe("periodToSearchString", () => {
  it("serializes this-year range for Apply", () => {
    const now = new Date(2026, 7, 19);
    const thisYear = rangePreset("thisYear", now);
    const qs = periodToSearchString({
      mode: "range",
      day: "2026-08-19",
      month: "2026-08",
      from: thisYear.from,
      to: thisYear.to,
    });
    const params = new URLSearchParams(qs);
    assert.equal(params.get("period"), "range");
    assert.equal(params.get("from"), "2026-01-01");
    assert.equal(params.get("to"), "2026-08-19");
  });
});
