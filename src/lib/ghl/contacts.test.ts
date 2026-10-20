import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactCustomFields } from "@/lib/ghl/contacts";

describe("contactCustomFields clears", () => {
  it("sends null, not an empty string, to clear date fields", () => {
    const fields = contactCustomFields({
      patNum: 1,
      firstName: null,
      lastName: null,
      phone: null,
      email: null,
      clearConsultDate: true,
      clearMissedApptDate: true,
      clearNextApptDate: true,
    });
    const byKey = new Map(fields.map((f) => [f.key, f.field_value]));
    assert.equal(byKey.get("od_consult_date"), null);
    assert.equal(byKey.get("od_missed_appt_date"), null);
    assert.equal(byKey.get("od_next_appt_date"), null);
  });

  it("writes the date when one is set", () => {
    const fields = contactCustomFields({
      patNum: 1,
      firstName: null,
      lastName: null,
      phone: null,
      email: null,
      consultDateYmd: "2026-11-05",
    });
    assert.equal(
      fields.find((f) => f.key === "od_consult_date")?.field_value,
      "2026-11-05",
    );
  });
});
