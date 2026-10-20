import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { annotateBrokenReasons } from "@/lib/warehouse/broken-appointment-reason";
import { mapConversionAttendance } from "@/lib/warehouse/conversion";
import type { AppointmentRecord, ProcedureRecord } from "@/lib/warehouse/types";

function appt(id: number, status: string, ymd: string, patientId = 1): AppointmentRecord {
  return { id, patient_id: patientId, apt_status: status, start_time: `${ymd}T09:00:00.000Z` };
}

function proc(code: string, ymd: string, patientId = 1, status = "Complete"): ProcedureRecord {
  return { patient_id: patientId, code, status, start_date: ymd } as ProcedureRecord;
}

describe("annotateBrokenReasons", () => {
  it("splits Broken visits into missed and cancelled", () => {
    const appointments = annotateBrokenReasons(
      [appt(1, "Broken", "2026-08-10", 1), appt(2, "Broken", "2026-08-10", 2)],
      [proc("D9986", "2026-08-10", 1), proc("D9987", "2026-08-06", 2)],
    );
    assert.deepEqual(appointments.map(mapConversionAttendance), ["no_show", "cancelled"]);
  });

  it("picks the nearest code when both are posted", () => {
    const [row] = annotateBrokenReasons(
      [appt(1, "Broken", "2026-08-10")],
      [proc("D9987", "2026-08-01"), proc("D9986", "2026-08-10")],
    );
    assert.equal(row?.broken_reason, "missed");
  });

  it("breaks ties toward the code posted before the visit, then D9986", () => {
    const appointments = annotateBrokenReasons(
      [appt(1, "Broken", "2026-08-10", 1), appt(2, "Broken", "2026-08-10", 2)],
      [
        proc("D9986", "2026-08-12", 1),
        proc("D9987", "2026-08-08", 1),
        proc("D9987", "2026-08-10", 2),
        proc("D9986", "2026-08-10", 2),
      ],
    );
    assert.deepEqual(
      appointments.map((row) => row.broken_reason),
      ["cancelled", "missed"],
    );
  });

  it("ignores codes outside the window, other patients, and incomplete rows", () => {
    const [row] = annotateBrokenReasons(
      [appt(1, "Broken", "2026-08-10", 1)],
      [
        proc("D9987", "2026-07-01", 1),
        proc("D9987", "2026-08-20", 1),
        proc("D9987", "2026-08-10", 2),
        proc("D9987", "2026-08-10", 1, "TreatmentPlan"),
      ],
    );
    assert.equal(row?.broken_reason, undefined);
    assert.equal(mapConversionAttendance(row!), "no_show");
  });

  it("counts Unscheduled-list visits only when a code is posted", () => {
    const appointments = annotateBrokenReasons(
      [appt(1, "UnschedList", "2026-08-10", 1), appt(2, "UnschedList", "2026-08-10", 2)],
      [proc("D9987", "2026-08-08", 1)],
    );
    assert.deepEqual(appointments.map(mapConversionAttendance), ["cancelled", "unknown"]);
  });

  it("leaves Complete visits as shows", () => {
    const [row] = annotateBrokenReasons(
      [appt(1, "Complete", "2026-08-10")],
      [proc("D9986", "2026-08-10")],
    );
    assert.equal(row?.broken_reason, undefined);
    assert.equal(mapConversionAttendance(row!), "show");
  });
});
