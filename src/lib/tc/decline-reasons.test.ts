import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NexTreatmentPlan } from "@/lib/nexhealth/client";
import { slimNexTreatmentPlan } from "@/lib/mongo/phi-policy";
import { summarizeTcMetrics } from "@/lib/nexhealth/tc-metrics";
import { emptyConversionSummary } from "@/lib/nexhealth/conversion";
import {
  isGhlDeclineOpportunity,
  mergeDeclineReasons,
  normalizeDeclineReason,
} from "@/lib/tc/decline-reasons";

describe("decline reasons", () => {
  it("normalizes free-text decline notes into categories", () => {
    assert.equal(
      normalizeDeclineReason("Patient needs to think about financing"),
      "Financing declined",
    );
    assert.equal(
      normalizeDeclineReason("Too expensive for right now"),
      "Cost / affordability",
    );
  });

  it("preserves normalized decline_reason when notes are stripped at sync", () => {
    const raw: NexTreatmentPlan = {
      id: 9,
      status: "rejected",
      updated_at: "2026-08-15T00:00:00Z",
      notes: "Needs spouse approval before moving forward",
      procedures: [
        {
          id: 1,
          status: "existing",
          fee: { amount: "500.00" },
          start_date: "2026-08-15",
        },
      ],
    };
    const slim = slimNexTreatmentPlan(raw);
    assert.equal(slim.decline_reason, "Needs spouse / family OK");
    assert.equal((slim as Record<string, unknown>).notes, undefined);
  });

  it("counts rejected plans in TC metrics", () => {
    const tc = summarizeTcMetrics({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      appointments: [],
      appointmentTypes: [],
      plans: [
        {
          id: 1,
          status: "rejected",
          updated_at: "2026-08-12T00:00:00Z",
          decline_reason: "Cost / affordability",
          procedures: [
            {
              id: 1,
              status: "existing",
              fee: { amount: "100.00" },
              start_date: "2026-08-12",
            },
          ],
        },
      ],
      procedures: [],
      payments: [],
      conversion: emptyConversionSummary(),
    });
    assert.equal(tc.declineTotal, 1);
    assert.equal(tc.declineReasons[0]?.reason, "Cost / affordability");
  });

  it("merges Open Dental and GHL decline rows", () => {
    const merged = mergeDeclineReasons(
      [{ reason: "Cost / affordability", count: 2 }],
      [{ reason: "Cost / affordability", count: 1 }, { reason: "Fear / anxiety", count: 1 }],
    );
    assert.deepEqual(merged, [
      { reason: "Cost / affordability", count: 3 },
      { reason: "Fear / anxiety", count: 1 },
    ]);
  });

  it("detects GHL lost stages and statuses", () => {
    assert.equal(isGhlDeclineOpportunity("Declined Treatment", "open"), true);
    assert.equal(isGhlDeclineOpportunity("Consult Booked", "lost"), true);
    assert.equal(isGhlDeclineOpportunity("Consult Booked", "open"), false);
  });
});
