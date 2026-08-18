import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCdtLookupFromDocs } from "@/lib/cdt/categories";
import type { NexAppointment, NexAppointmentType, NexProcedure, NexTreatmentPlan } from "./client";
import {
  isTreatmentPlanClosed,
  mapConversionAttendance,
  summarizeConversion,
} from "./conversion";

const CONSULT_TYPE_ID = 10;

const consultType: NexAppointmentType = {
  id: CONSULT_TYPE_ID,
  name: "NP Consult",
};

function appt(partial: Partial<NexAppointment> & Pick<NexAppointment, "id">): NexAppointment {
  return {
    appointment_type_id: CONSULT_TYPE_ID,
    ...partial,
  };
}

describe("mapConversionAttendance", () => {
  it("drops OD confirm 66 and 67 as cancelled", () => {
    assert.equal(
      mapConversionAttendance(appt({ id: 1, confirmation_status: 66 })),
      "cancelled",
    );
    assert.equal(
      mapConversionAttendance(appt({ id: 2, confirm_status: "67" })),
      "cancelled",
    );
    assert.equal(
      mapConversionAttendance(
        appt({ id: 3, confirmation: { def_num: 66, name: "Office cancel" } }),
      ),
      "cancelled",
    );
  });

  it("counts OD confirm 69 as no-show", () => {
    assert.equal(
      mapConversionAttendance(appt({ id: 4, confirmation_status: 69 })),
      "no_show",
    );
    assert.equal(
      mapConversionAttendance(appt({ id: 5, confirm_status: "no show" })),
      "no_show",
    );
  });

  it("maps Complete / Broken apt status", () => {
    assert.equal(
      mapConversionAttendance(appt({ id: 6, apt_status: "Complete" })),
      "show",
    );
    assert.equal(
      mapConversionAttendance(appt({ id: 7, appointment_status: "Broken" })),
      "no_show",
    );
  });
});

describe("summarizeConversion", () => {
  it("drops 66/67 from show-rate denominator and counts 69 as miss", () => {
    const summary = summarizeConversion({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      appointmentTypes: [consultType],
      appointments: [
        appt({
          id: 1,
          patient_id: 1,
          start_time: "2026-08-10T14:00:00+0000",
          apt_status: "Complete",
        }),
        appt({
          id: 2,
          patient_id: 2,
          start_time: "2026-08-11T14:00:00+0000",
          confirmation_status: 69,
        }),
        appt({
          id: 3,
          patient_id: 3,
          start_time: "2026-08-12T14:00:00+0000",
          confirmation_status: 66,
        }),
        appt({
          id: 4,
          patient_id: 4,
          start_time: "2026-08-13T14:00:00+0000",
          confirmation_status: 67,
        }),
      ],
    });
    assert.equal(summary.npConsultShow, 1);
    assert.equal(summary.npConsultNoShow, 1);
    assert.equal(summary.npConsultCancelled, 2);
    assert.equal(summary.npConsultBooked, 2);
    assert.equal(summary.npConsultShowRate, 0.5);
  });

  it("counts NP as first completed non-consult appointment in period", () => {
    const summary = summarizeConversion({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      appointmentTypes: [consultType],
      appointments: [
        appt({
          id: 1,
          patient_id: 10,
          start_time: "2026-07-15T14:00:00+0000",
          apt_status: "Complete",
        }),
        {
          id: 2,
          patient_id: 10,
          appointment_type_id: 99,
          start_time: "2026-08-08T14:00:00+0000",
          apt_status: "Complete",
        },
        {
          id: 3,
          patient_id: 11,
          appointment_type_id: 99,
          start_time: "2026-08-09T14:00:00+0000",
          apt_status: "Complete",
        },
        {
          id: 4,
          patient_id: 12,
          appointment_type_id: 99,
          start_time: "2026-07-01T14:00:00+0000",
          apt_status: "Complete",
        },
        {
          id: 5,
          patient_id: 12,
          appointment_type_id: 99,
          start_time: "2026-08-20T14:00:00+0000",
          apt_status: "Complete",
        },
      ],
    });
    // 10: first Tx is Aug 8 (consult in July does not count) → NP
    // 11: first Tx is Aug 9 → NP
    // 12: first Tx is July 1 (outside period) → not NP
    assert.equal(summary.newPatients, 2);
  });

  it("counts same-day start from U-AOXS Complete on consult day", () => {
    const procedures: NexProcedure[] = [
      {
        id: 1,
        patient_id: 20,
        code: "U-AOXS",
        status: "completed",
        start_date: "2026-08-10",
      },
    ];
    const summary = summarizeConversion({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      appointmentTypes: [consultType],
      appointments: [
        appt({
          id: 1,
          patient_id: 20,
          start_time: "2026-08-10T14:00:00+0000",
          apt_status: "Complete",
        }),
      ],
      procedures,
    });
    assert.equal(summary.npConsultShow, 1);
    assert.equal(summary.sameDayStarts, 1);
    assert.equal(summary.sameDayStartRate, 1);
  });

  it("counts consult procedure Complete as consult show when types are missing", () => {
    const consultCode = "NP-CONSULT";
    const cdt = createCdtLookupFromDocs([
      {
        code: consultCode,
        category: "Uncategorized",
        description: "New patient consult",
        isConsult: true,
      },
    ]);
    const procedures: NexProcedure[] = [
      {
        id: 1,
        patient_id: 30,
        code: consultCode,
        status: "completed",
        start_date: "2026-08-15",
      },
      {
        id: 2,
        patient_id: 30,
        code: "D7140",
        status: "completed",
        start_date: "2026-08-15",
      },
    ];
    const summary = summarizeConversion({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      appointmentTypes: [{ id: 1, name: "Hygiene" }],
      appointments: [],
      procedures,
      cdt,
    });
    assert.equal(summary.npConsultShow, 1);
    assert.equal(summary.sameDayStarts, 1);
  });

  it("excludes accepted treatment plans that are not fully complete", () => {
    const incomplete: NexTreatmentPlan = {
      id: 1,
      patient_id: 40,
      status: "accepted",
      updated_at: "2026-08-18T00:00:00Z",
      procedures: [
        {
          id: 1,
          status: "completed",
          fee: { amount: "100.00" },
          start_date: "2026-08-18",
        },
        {
          id: 2,
          status: "existing",
          fee: { amount: "200.00" },
          start_date: "2026-08-18",
        },
      ],
    };
    const complete: NexTreatmentPlan = {
      id: 2,
      patient_id: 41,
      status: "accepted",
      updated_at: "2026-08-19T00:00:00Z",
      procedures: [
        {
          id: 3,
          status: "completed",
          fee: { amount: "50.00" },
          start_date: "2026-08-19",
        },
        {
          id: 4,
          status: "Complete",
          fee: { amount: "25.00" },
          start_date: "2026-08-19",
        },
      ],
    };
    assert.equal(isTreatmentPlanClosed(incomplete), false);
    assert.equal(isTreatmentPlanClosed(complete), true);

    const summary = summarizeConversion({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      appointmentTypes: [consultType],
      appointments: [],
      plans: [incomplete, complete],
    });
    assert.equal(summary.tpClosedCount, 1);
    assert.equal(summary.tpClosedCents, 7500);
  });

  it("counts empty TP as closed only when status is completed", () => {
    assert.equal(
      isTreatmentPlanClosed({ id: 1, status: "accepted", procedures: [] }),
      false,
    );
    assert.equal(
      isTreatmentPlanClosed({ id: 2, status: "completed", procedures: [] }),
      true,
    );
  });
});
