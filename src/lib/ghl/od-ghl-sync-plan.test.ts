import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MissedApptSignal,
  nextConsultDateYmd,
  nextScheduledApptDateYmd,
  OdTxtMsgOk,
  resolveActiveSequence,
  smsConsentAction,
  toCentralYmd,
  missedSignalFromAppointment,
} from "@/lib/ghl/od-ghl-sync-plan";
import { OdAptStatus } from "@/lib/opendental/types";

describe("resolveActiveSequence", () => {
  it("sets None when booked", () => {
    assert.equal(
      resolveActiveSequence({ hasFutureAppt: true, isNewContact: true }),
      "None",
    );
    assert.equal(
      resolveActiveSequence({ hasFutureAppt: true, isNewContact: false }),
      "None",
    );
  });

  it("sets New Inquiries only for newly created unbooked contacts", () => {
    assert.equal(
      resolveActiveSequence({ hasFutureAppt: false, isNewContact: true }),
      "New Inquiries",
    );
  });

  it("leaves Active Sequence alone for existing unbooked contacts", () => {
    assert.equal(
      resolveActiveSequence({ hasFutureAppt: false, isNewContact: false }),
      null,
    );
  });
});

describe("smsConsentAction (Text OK → DND)", () => {
  it("maps Yes / No / blank", () => {
    assert.deepEqual(smsConsentAction(OdTxtMsgOk.Yes), {
      kind: "allow_if_not_dnd",
    });
    assert.deepEqual(smsConsentAction(OdTxtMsgOk.No), { kind: "set_dnd" });
    assert.deepEqual(smsConsentAction(OdTxtMsgOk.Unknown), {
      kind: "no_text_keep_dnd",
    });
    assert.deepEqual(smsConsentAction(null), { kind: "no_text_keep_dnd" });
    assert.deepEqual(smsConsentAction(undefined), {
      kind: "no_text_keep_dnd",
    });
  });
});

describe("toCentralYmd / consult / next dates", () => {
  it("formats America/Chicago calendar date", () => {
    // 2026-03-15 05:00 UTC is still 2026-03-14 evening Central (CDT).
    const ymd = toCentralYmd("2026-03-15 05:00:00");
    assert.ok(ymd === "2026-03-14" || ymd === "2026-03-15");
  });

  it("picks next consult and clears when none", () => {
    assert.equal(
      nextConsultDateYmd([
        { AptDateTime: "2026-11-01 10:00:00", isConsult: false },
        { AptDateTime: "2026-11-05 14:00:00", isConsult: true },
      ]),
      toCentralYmd("2026-11-05 14:00:00"),
    );
    assert.equal(nextConsultDateYmd([]), null);
    assert.equal(
      nextConsultDateYmd([{ AptDateTime: "2026-11-01 10:00:00", isConsult: false }]),
      null,
    );
  });

  it("picks next scheduled appt date", () => {
    assert.equal(
      nextScheduledApptDateYmd([
        { AptDateTime: "2026-12-01 09:00:00" },
      ]),
      toCentralYmd("2026-12-01 09:00:00"),
    );
  });
});

describe("missedSignalFromAppointment", () => {
  it("detects broken, no-show, and cancel", () => {
    const broken = missedSignalFromAppointment({
      aptStatus: OdAptStatus.Broken,
      brokenStatus: OdAptStatus.Broken,
      confirmFamily: null,
      aptDateTime: "2026-10-10 13:00:00",
    });
    assert.ok(broken);
    assert.equal(broken!.reason, "broken");

    const noshow = missedSignalFromAppointment({
      aptStatus: OdAptStatus.Scheduled,
      brokenStatus: OdAptStatus.Broken,
      confirmFamily: "no_show",
      aptDateTime: "2026-10-11 13:00:00",
    });
    assert.ok(noshow);
    assert.equal((noshow as MissedApptSignal).reason, "no_show");

    const cancel = missedSignalFromAppointment({
      aptStatus: OdAptStatus.Scheduled,
      brokenStatus: OdAptStatus.Broken,
      confirmFamily: "patient_cancel",
      aptDateTime: "2026-10-12 13:00:00",
    });
    assert.ok(cancel);
    assert.equal(cancel!.reason, "cancel");
  });
});
