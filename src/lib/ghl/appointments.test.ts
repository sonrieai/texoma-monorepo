import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appointmentEndIso,
  mapOdAptStatusToGhl,
  odAptDateTimeToIso,
  odPatternDurationMinutes,
} from "@/lib/ghl/appointments";
import { resolveActiveSequence } from "@/lib/ghl/od-ghl-sync-plan";
import { OdAptStatus } from "@/lib/opendental/types";
import {
  assertTexomaGhlLocation,
  TEXOMA_GHL_LOCATION_ID,
} from "@/lib/ghl/config";

describe("od appointment → ghl mapping", () => {
  it("maps OD statuses to GHL appointmentStatus", () => {
    assert.equal(mapOdAptStatusToGhl(OdAptStatus.Scheduled), "confirmed");
    assert.equal(mapOdAptStatusToGhl(OdAptStatus.Complete), "showed");
    assert.equal(mapOdAptStatusToGhl(OdAptStatus.Broken), "noshow");
  });

  it("derives duration from Pattern (5 minutes per char)", () => {
    assert.equal(odPatternDurationMinutes("//////"), 30);
    assert.equal(odPatternDurationMinutes(""), 30);
  });

  it("builds ISO start/end times from Chicago wall time", () => {
    // 2026-10-20 is CDT (UTC-5): 14:00 Chicago → 19:00Z
    const start = odAptDateTimeToIso("2026-10-20 14:00:00");
    assert.equal(start, "2026-10-20T19:00:00.000Z");
    const end = appointmentEndIso(start!, "//////");
    assert.equal(new Date(end).getTime() - new Date(start!).getTime(), 30 * 60_000);
  });

  it("uses CST offset in winter", () => {
    // 2026-01-15 is CST (UTC-6): 14:00 Chicago → 20:00Z
    assert.equal(
      odAptDateTimeToIso("2026-01-15 14:00:00"),
      "2026-01-15T20:00:00.000Z",
    );
  });
});

describe("active sequence from has_future_appt + new contact", () => {
  it("sets None when booked; New Inquiries only when new and unbooked", () => {
    assert.equal(
      resolveActiveSequence({ hasFutureAppt: true, isNewContact: false }),
      "None",
    );
    assert.equal(
      resolveActiveSequence({ hasFutureAppt: false, isNewContact: true }),
      "New Inquiries",
    );
    assert.equal(
      resolveActiveSequence({ hasFutureAppt: false, isNewContact: false }),
      null,
    );
  });
});

describe("Texoma location lock", () => {
  it("accepts only the Texoma location id", () => {
    const ok = assertTexomaGhlLocation({
      apiKey: "x",
      locationId: TEXOMA_GHL_LOCATION_ID,
      baseUrl: "https://services.leadconnectorhq.com",
      sourceCustomFieldId: null,
    });
    assert.equal(ok.locationId, "m7Fk4S7LR8eTebuM3QPh");
    assert.throws(() =>
      assertTexomaGhlLocation({
        apiKey: "x",
        locationId: "vGf50fY7ITmNzWPK1CPY",
        baseUrl: "https://services.leadconnectorhq.com",
        sourceCustomFieldId: null,
      }),
    );
  });
});
