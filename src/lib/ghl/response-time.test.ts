import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  medianLeadResponseMinutes,
  slimResponseEvent,
} from "@/lib/ghl/response-time";

describe("lead response time", () => {
  it("drops message text and keeps direction plus time", () => {
    const event = slimResponseEvent({
      conversationId: "c1",
      direction: "inbound",
      createdAt: "2026-10-01T15:00:00.000Z",
      body: "patient name and phone",
    });
    assert.deepEqual(event, {
      conversationId: "c1",
      inbound: true,
      at: Date.parse("2026-10-01T15:00:00.000Z"),
    });
    assert.equal(
      slimResponseEvent({
        conversationId: "c1",
        direction: "inbound",
        messageType: "TYPE_ACTIVITY_OPPORTUNITY",
        createdAt: "2026-10-01T15:00:00.000Z",
      }),
      null,
    );
  });

  it("uses the median first reply", () => {
    const t0 = Date.parse("2026-10-01T15:00:00.000Z");
    const minutes = medianLeadResponseMinutes([
      { conversationId: "a", inbound: true, at: t0 },
      { conversationId: "a", inbound: false, at: t0 + 4 * 60_000 },
      { conversationId: "b", inbound: true, at: t0 },
      { conversationId: "b", inbound: false, at: t0 + 10 * 60_000 },
    ]);
    assert.equal(minutes, 7);
  });
});
