import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferNpConsultAppointmentTypeFromName } from "@/lib/opendental/infer-np-consult-appointment-type";

describe("inferNpConsultAppointmentTypeFromName", () => {
  it("matches NP consult type names from Open Dental", () => {
    assert.equal(inferNpConsultAppointmentTypeFromName("New Patient Exam"), true);
    assert.equal(
      inferNpConsultAppointmentTypeFromName("New Patient Implant Consult "),
      true,
    );
    assert.equal(inferNpConsultAppointmentTypeFromName("Finance Consult"), true);
  });

  it("excludes returning patient exams", () => {
    assert.equal(
      inferNpConsultAppointmentTypeFromName("Returning Patient Exam"),
      false,
    );
  });
});
