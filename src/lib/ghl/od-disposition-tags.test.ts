import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NEW_PATIENT_TAGS,
  NEW_PATIENT_TAG,
  NO_SHOW_TAGS,
  TREATMENT_COORDINATORS,
  appointmentTagEffect,
  classifyConfirmName,
  consultLineForAppointment,
  consultLineFromText,
  foldTagEffects,
  isConsultAppointment,
  pendingNewPatientTags,
  soldLine,
  tagsForNewPatientSend,
} from "@/lib/ghl/od-disposition-tags";
import { normalizeOdGhlSyncState } from "@/lib/ghl/od-ghl-sync-state";
import {
  normalizeEmail,
  normalizeUsPhone,
  syncAlreadyApplied,
} from "@/lib/ghl/od-ghl-sync-plan";

describe("consult appointments for od_consult_date", () => {
  it("counts D0150, D0120, and D0150.2 as consults", () => {
    for (const code of ["D0150", "D0120", "D0150.2", " d0150 "]) {
      assert.equal(
        isConsultAppointment({ appointmentTypeName: null, procedureCodes: [code] }),
        true,
        code,
      );
    }
  });

  it("does not count other D0150 variants or unrelated codes", () => {
    for (const code of ["D0150.1", "D0150.3", "D1110"]) {
      assert.equal(
        isConsultAppointment({ appointmentTypeName: null, procedureCodes: [code] }),
        false,
        code,
      );
    }
  });

  it("still counts N9310 consult lines", () => {
    assert.equal(
      isConsultAppointment({
        appointmentTypeName: null,
        procedureCodes: ["N9310 AOX Consult"],
      }),
      true,
    );
  });

  it("exam codes add no consult line tag", () => {
    assert.equal(
      consultLineForAppointment({
        appointmentTypeName: null,
        procedureCodes: ["D0150", "D0120", "D0150.2"],
      }),
      null,
    );
  });
});

describe("consult lines", () => {
  it("maps the five consult names", () => {
    assert.equal(consultLineFromText("N9310 AOX Consult"), "aox");
    assert.equal(consultLineFromText("N9310 IMP Consult"), "imp");
    assert.equal(consultLineFromText("N9310.OTN"), "otn");
    assert.equal(consultLineFromText("N9310.UTN"), "utn");
    assert.equal(consultLineFromText("N9310 DENT Consult"), "dent");
    assert.equal(consultLineFromText("Snap in denture"), "imp");
    assert.equal(consultLineFromText("ALL ON X Consult"), "aox");
  });
});

describe("confirmation names", () => {
  it("maps each no-show name to its tag", () => {
    const cases: Array<[string, string]> = [
      ["69 AOX NO SHOW - AOX No-Showed", NO_SHOW_TAGS.aox],
      ["69 IMPLANT NOSH - IMP No-Showed", NO_SHOW_TAGS.imp],
      ["69OTN - OVER 10K no showed", NO_SHOW_TAGS.otn],
      ["69UTN-Under 10k no showed", NO_SHOW_TAGS.utn],
      ["69 DENT - Dentures No-Showed", NO_SHOW_TAGS.dent],
    ];
    for (const [name, tag] of cases) {
      assert.equal(
        appointmentTagEffect({
          completed: false,
          confirmName: name,
          appointmentTypeName: null,
          procedureCodes: [],
        }),
        tag,
        name,
      );
    }
  });

  it("uses the consult line for a generic 69", () => {
    assert.equal(
      appointmentTagEffect({
        completed: false,
        confirmName: "69",
        appointmentTypeName: "N9310 AOX Consult",
        procedureCodes: [],
      }),
      NO_SHOW_TAGS.aox,
    );
    assert.equal(
      appointmentTagEffect({
        completed: false,
        confirmName: "69 No-Show",
        appointmentTypeName: null,
        procedureCodes: ["N9310.OTN"],
      }),
      NO_SHOW_TAGS.otn,
    );
  });

  it("does not invent a tag when a generic 69 has no consult line", () => {
    assert.equal(
      appointmentTagEffect({
        completed: false,
        confirmName: "69",
        appointmentTypeName: "Limited exam",
        procedureCodes: [],
      }),
      "leave",
    );
  });

  it("clears the no-show tag for cancel, reschedule, and show", () => {
    const names = [
      "66",
      "66 AOX Cancel - AOX Cancelled by Team",
      "66 IMPCANCEL - IMP Cancelled by Team",
      "66OTN - OVER 10K Cancelled by Team",
      "66UTN-Under 10k cancelled by team",
      "66 DENT CANC - Dentures Cancelled by Team",
      "67",
      "67 AOX Cancel - AOX Cancelled by Patient",
      "67 IMP CANCEL - IMP Cancelled by Patient",
      "67OTN - OVER 10K Cancelled by Patient",
      "67UTN-Under 10k cancelled by Patient",
      "68",
      "68 AOX RESCH - AOX Rescheduled by Patient",
      "68 IMP RESC - IMP Rescheduled by Patient",
      "68OTN - OVER 10K Rescheduled by pt",
      "68UTN-Under 10k Rescheduled by pt",
      "68 DENT RESCH - Dentures Rescheduled by Patient",
    ];
    for (const name of names) {
      assert.equal(
        appointmentTagEffect({
          completed: false,
          confirmName: name,
          appointmentTypeName: "N9310 DENT Consult",
          procedureCodes: [],
        }),
        "clear",
        name,
      );
    }
    assert.equal(
      appointmentTagEffect({
        completed: true,
        confirmName: "69 AOX NO SHOW",
        appointmentTypeName: "N9310 AOX Consult",
        procedureCodes: [],
      }),
      "clear",
    );
  });

  it("leaves tags alone for a booked consult", () => {
    assert.equal(
      appointmentTagEffect({
        completed: false,
        confirmName: null,
        appointmentTypeName: "N9310 DENT Consult",
        procedureCodes: [],
      }),
      "leave",
    );
    assert.equal(classifyConfirmName("67 DENT")?.family, "patient_cancel");
    assert.equal(classifyConfirmName("67 DENT")?.line, null);
    assert.equal(
      classifyConfirmName("67 AOX Cancel - AOX Cancelled by Patient")?.family,
      "patient_cancel",
    );
  });
});

describe("sold codes and coordinators", () => {
  it("maps sold procedures onto consult lines", () => {
    assert.equal(soldLine("U-AOXS"), "aox");
    assert.equal(soldLine("U-AOXD"), "aox");
    assert.equal(soldLine("U-OTN"), "otn");
    assert.equal(soldLine("U-UTN"), "utn");
    assert.equal(soldLine("U-IMP"), "utn");
    assert.equal(soldLine("U-DENTS"), "dent");
    assert.equal(soldLine("U-DENTD"), "dent");
    assert.equal(soldLine("U-SNAPS"), "imp");
    assert.equal(soldLine("U-SNAPD"), "imp");
    assert.equal(soldLine("D1110"), null);
  });

  it("keeps coordinator codes off the tag list", () => {
    assert.deepEqual(
      TREATMENT_COORDINATORS.map((row) => row.code),
      ["N9210", "N9410", "N9510"],
    );
  });
});

describe("sync state", () => {
  it("keeps only the contact id and no-show tag", () => {
    const state = normalizeOdGhlSyncState({
      cursor: "2026-10-09 10:00:00",
      contacts: {
        "42": {
          ghlContactId: "abc",
          noShowTag: "NO SHOWED AOX",
          newPatientTags: ["NEW PATIENT", "NOT A TAG"],
          phone: "5551234567",
          email: "a@b.com",
        },
      },
    });
    assert.equal(state.contacts["42"]?.ghlContactId, "abc");
    assert.equal(state.contacts["42"]?.noShowTag, "NO SHOWED AOX");
    assert.deepEqual(state.contacts["42"]?.newPatientTags, ["NEW PATIENT"]);
    assert.equal("phone" in (state.contacts["42"] ?? {}), false);
    assert.equal(normalizeUsPhone("(580) 555-0100"), "+15805550100");
    assert.equal(normalizeEmail(" Ada@Clinic.com "), "ada@clinic.com");
    assert.equal(
      syncAlreadyApplied(
        {
          ghlContactId: "abc",
          noShowTag: "NO SHOWED AOX",
          hasFutureAppt: false,
          activeSequence: "New Inquiries",
        },
        "NO SHOWED AOX",
        false,
      ),
      true,
    );
    assert.equal(
      syncAlreadyApplied(
        {
          ghlContactId: "abc",
          noShowTag: null,
          hasFutureAppt: true,
          activeSequence: "None",
        },
        "clear",
        true,
      ),
      true,
    );
    assert.equal(
      syncAlreadyApplied(
        {
          ghlContactId: "abc",
          noShowTag: null,
          hasFutureAppt: false,
          activeSequence: "New Inquiries",
        },
        "leave",
        true,
      ),
      false,
    );
  });
});

describe("new patient tags", () => {
  it("adds the base tag and the consult line on the first send", () => {
    assert.deepEqual(tagsForNewPatientSend([]), [NEW_PATIENT_TAG]);
    assert.deepEqual(tagsForNewPatientSend(["aox", "aox"]), [
      NEW_PATIENT_TAG,
      NEW_PATIENT_TAGS.aox,
    ]);
    assert.deepEqual(
      pendingNewPatientTags(null, ["dent"]),
      [NEW_PATIENT_TAG, NEW_PATIENT_TAGS.dent],
    );
  });

  it("adds only a consult line that was not stored yet", () => {
    assert.deepEqual(
      pendingNewPatientTags(
        { ghlContactId: "abc", newPatientTags: [NEW_PATIENT_TAG] },
        ["imp"],
      ),
      [NEW_PATIENT_TAGS.imp],
    );
    assert.deepEqual(
      pendingNewPatientTags(
        {
          ghlContactId: "abc",
          newPatientTags: [NEW_PATIENT_TAG, NEW_PATIENT_TAGS.imp],
        },
        ["imp"],
      ),
      [],
    );
  });

  it("does not backfill contacts synced before new-patient tags", () => {
    assert.deepEqual(
      pendingNewPatientTags({ ghlContactId: "abc" }, ["aox"]),
      [],
    );
  });
});

describe("foldTagEffects", () => {
  it("lets a later clear or tag replace an earlier one", () => {
    assert.equal(
      foldTagEffects(["leave", NO_SHOW_TAGS.aox, "leave"]),
      NO_SHOW_TAGS.aox,
    );
    assert.equal(foldTagEffects([NO_SHOW_TAGS.imp, "clear"]), "clear");
    assert.equal(foldTagEffects(["leave", "leave"]), "leave");
  });
});
