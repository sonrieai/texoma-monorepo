import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consultDateBackfillAction,
  earliestYmd,
  ghlDateFieldYmd,
  nextConsultDateByPatient,
} from "@/lib/ghl/consult-date-backfill";
import { patNumsByContact } from "@/lib/ghl/od-ghl-sync-plan";

describe("patNumsByContact", () => {
  it("returns every PatNum on the same GHL contact", () => {
    const shared = patNumsByContact({
      "14864": { ghlContactId: "c1" },
      "14933": { ghlContactId: "c1" },
      "4005": { ghlContactId: "c2" },
    });
    assert.deepEqual(shared(14933).sort(), [14864, 14933]);
    assert.deepEqual(shared(4005), [4005]);
    assert.deepEqual(shared(99), [99]);
  });
});

describe("nextConsultDateByPatient", () => {
  const appts = [
    { AptNum: 1, PatNum: 10, AptDateTime: "2026-11-05 09:00:00", AppointmentTypeName: null },
    { AptNum: 2, PatNum: 10, AptDateTime: "2026-11-01 09:00:00", AppointmentTypeName: null },
    { AptNum: 3, PatNum: 20, AptDateTime: "2026-11-02 09:00:00", AppointmentTypeName: null },
    { AptNum: 4, PatNum: 30, AptDateTime: "2026-11-03 09:00:00", AppointmentTypeName: null },
    { AptNum: 5, PatNum: 40, AptDateTime: "2026-11-04 09:00:00", AppointmentTypeName: "ALL ON X Consult" },
  ];
  const codes = new Map<number, string[]>([
    [1, ["D0150"]],
    [2, ["D1110"]],
    [3, ["D0120"]],
    [4, ["D0150.1"]],
  ]);

  it("uses the earliest consult, the three exam codes, and consult types", () => {
    const out = nextConsultDateByPatient(appts, codes);
    assert.equal(out.get(10), "2026-11-05");
    assert.equal(out.get(20), "2026-11-02");
    assert.equal(out.has(30), false);
    assert.equal(out.get(40), "2026-11-04");
  });
});

describe("earliestYmd", () => {
  it("picks the earliest date across a contact's PatNums", () => {
    assert.equal(earliestYmd([undefined, "2026-11-05", "2026-10-22", null]), "2026-10-22");
    assert.equal(earliestYmd([undefined, null]), null);
  });
});

describe("ghlDateFieldYmd", () => {
  it("reads string, ISO, and epoch-ms values", () => {
    assert.equal(ghlDateFieldYmd("2026-11-05"), "2026-11-05");
    assert.equal(ghlDateFieldYmd("2026-11-05T00:00:00.000Z"), "2026-11-05");
    assert.equal(ghlDateFieldYmd(Date.UTC(2026, 10, 5)), "2026-11-05");
    assert.equal(ghlDateFieldYmd(String(Date.UTC(2026, 10, 5))), "2026-11-05");
    assert.equal(ghlDateFieldYmd(""), null);
    assert.equal(ghlDateFieldYmd(undefined), null);
  });
});

describe("consultDateBackfillAction", () => {
  it("sets an empty field and skips one that already matches", () => {
    assert.equal(
      consultDateBackfillAction({ current: null, next: "2026-11-05", linked: false }),
      "set",
    );
    assert.equal(
      consultDateBackfillAction({ current: "2026-11-05", next: "2026-11-05", linked: true }),
      "unchanged",
    );
  });

  it("changes a wrong date", () => {
    assert.equal(
      consultDateBackfillAction({ current: "2026-09-01", next: "2026-11-05", linked: false }),
      "change",
    );
  });

  it("clears only contacts this sync already linked", () => {
    assert.equal(
      consultDateBackfillAction({ current: "2026-09-01", next: null, linked: true }),
      "clear",
    );
    assert.equal(
      consultDateBackfillAction({ current: "2026-09-01", next: null, linked: false }),
      "unchanged",
    );
  });
});
