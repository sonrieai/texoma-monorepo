import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chicagoWallToUtcIso,
  parseOdWallParts,
  PRACTICE_TIME_ZONE,
  toCentralYmd,
  todayCentralYmd,
} from "@/lib/ghl/practice-time";

describe("practice-time America/Chicago", () => {
  it("exports the practice zone", () => {
    assert.equal(PRACTICE_TIME_ZONE, "America/Chicago");
  });

  it("parses naive OD wall parts", () => {
    assert.deepEqual(parseOdWallParts("2026-11-05 14:30:00"), {
      year: 2026,
      month: 11,
      day: 5,
      hour: 14,
      minute: 30,
      second: 0,
    });
  });

  it("maps naive wall date to YMD without host TZ", () => {
    assert.equal(toCentralYmd("2026-03-15 05:00:00"), "2026-03-15");
  });

  it("converts CDT and CST wall times to UTC ISO", () => {
    assert.equal(
      chicagoWallToUtcIso({
        year: 2026,
        month: 10,
        day: 20,
        hour: 14,
        minute: 0,
        second: 0,
      }),
      "2026-10-20T19:00:00.000Z",
    );
    assert.equal(
      chicagoWallToUtcIso({
        year: 2026,
        month: 1,
        day: 15,
        hour: 14,
        minute: 0,
        second: 0,
      }),
      "2026-01-15T20:00:00.000Z",
    );
  });

  it("formats today in America/Chicago", () => {
    assert.equal(
      todayCentralYmd(new Date("2026-03-15T04:30:00.000Z")),
      "2026-03-14",
    );
    assert.equal(
      todayCentralYmd(new Date("2026-03-15T05:00:00.000Z")),
      "2026-03-15",
    );
  });
});
