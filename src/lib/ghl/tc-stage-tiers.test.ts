import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  furthestTier,
  stageTierFromStageId,
  TC_STAGE_TIER_BY_ID,
} from "@/lib/ghl/tc-stage-tiers";

describe("TC stage ID → tier", () => {
  it("maps Texoma TC + Leads stage ids", () => {
    assert.ok(Object.keys(TC_STAGE_TIER_BY_ID).length >= 12);
  });

  it("maps Consults Today to booked, not lead", () => {
    assert.equal(
      stageTierFromStageId("72627739-9c69-4c05-b823-2cf61aafa34f"),
      "booked",
    );
  });

  it("maps Showed - Plan Presented and financing wait to showed", () => {
    assert.equal(
      stageTierFromStageId("45e53c62-cd45-44bf-b8b7-730743304d8a"),
      "showed",
    );
    assert.equal(
      stageTierFromStageId("d271ed3e-8933-40c9-9fec-29119d378bd5"),
      "showed",
    );
  });

  it("maps Sold - Scheduled to accepted", () => {
    assert.equal(
      stageTierFromStageId("e2b50906-c25c-46a1-b080-776410c9d075"),
      "accepted",
    );
  });

  it("returns unmapped for unknown ids (never lead)", () => {
    assert.equal(stageTierFromStageId("not-a-real-stage"), "unmapped");
    assert.equal(stageTierFromStageId(""), "unmapped");
    assert.equal(stageTierFromStageId(null), "unmapped");
  });

  it("furthestTier keeps showed over later booked", () => {
    assert.equal(furthestTier("showed", "booked"), "showed");
    assert.equal(furthestTier("booked", "surgery"), "surgery");
  });
});
