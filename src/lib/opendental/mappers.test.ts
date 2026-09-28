/**
 * Unit tests for Open Dental → warehouse mappers (synthetic, non-PHI).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapOdAppointment,
  mapOdClaim,
  mapOdPatient,
  mapOdPaySplit,
  mapOdProcedure,
  mapOdProcedureToCharge,
  mapOdProcStatus,
  mapOdProvider,
  odDateToIso,
  odDateToYmd,
} from "@/lib/opendental/mappers";
import { OdAptStatus, OdProcStatus } from "@/lib/opendental/types";

describe("opendental mappers", () => {
  it("maps provider display name and inactive flag", () => {
    const raw = mapOdProvider({
      ProvNum: 7,
      Abbr: "JD",
      FName: "Jane",
      LName: "Doe",
      IsHidden: 0,
      DateTStamp: "2024-01-02 03:04:05",
    });
    assert.equal(raw.id, 7);
    assert.equal(raw.name, "Jane Doe");
    assert.equal(raw.inactive, false);
  });

  it("maps appointment confirm 69 as no-show and Complete status", () => {
    const complete = mapOdAppointment({
      AptNum: 100,
      PatNum: 5,
      ProvNum: 2,
      AptStatus: OdAptStatus.Complete,
      AptDateTime: "2024-06-01 09:00:00",
      Confirmed: 0,
      AppointmentTypeNum: 3,
      ClinicNum: 1,
      DateTStamp: null,
      DateTimeArrived: "2024-06-01 09:05:00",
      DateTimeDismissed: "2024-06-01 10:00:00",
    });
    assert.equal(complete.apt_status, "Complete");
    assert.equal(complete.cancelled, false);
    assert.equal(complete.patient_id, 5);

    const noShow = mapOdAppointment({
      AptNum: 101,
      PatNum: 5,
      ProvNum: 2,
      AptStatus: OdAptStatus.Broken,
      AptDateTime: "2024-06-02 09:00:00",
      Confirmed: 69,
      AppointmentTypeNum: null,
      ClinicNum: 1,
      DateTStamp: null,
      DateTimeArrived: null,
      DateTimeDismissed: null,
    });
    assert.equal(noShow.cancelled, true);
    assert.equal(noShow.patient_missed, true);
    assert.equal(noShow.def_num, 69);
  });

  it("maps complete procedures to charges and statuses", () => {
    assert.equal(mapOdProcStatus(OdProcStatus.Complete), "Complete");
    assert.equal(mapOdProcStatus(OdProcStatus.TP), "TreatmentPlan");

    const row = {
      ProcNum: 55,
      PatNum: 9,
      ProvNum: 1,
      CodeNum: 12,
      ProcStatus: OdProcStatus.Complete,
      ProcDate: "2024-03-15",
      ProcFee: 250.5,
      AptNum: 1,
      ClinicNum: 0,
      DateTStamp: null,
      DateComplete: "2024-03-15",
      ProcCode: "D2740",
      Descript: "Crown",
      ProcCat: 4,
    };
    const proc = mapOdProcedure(row);
    assert.equal(proc.code, "D2740");
    assert.equal(proc.fee?.amount, "250.50");
    assert.equal(proc.status, "Complete");

    const charge = mapOdProcedureToCharge(row);
    assert.ok(charge);
    assert.equal(charge!.procedure_code, "D2740");
    assert.equal(charge!.id, 55);

    assert.equal(
      mapOdProcedureToCharge({ ...row, ProcStatus: OdProcStatus.TP }),
      null,
    );
  });

  it("maps paysplits and claims", () => {
    const pay = mapOdPaySplit({
      SplitNum: 88,
      PayNum: 1,
      PatNum: 3,
      ProvNum: 2,
      SplitAmt: 40,
      DatePay: "2024-04-01",
      ProcNum: null,
      UnearnedType: 0,
      ClinicNum: 0,
      PayType: 10,
      PayTypeName: "Check",
    });
    assert.equal(pay.payment_amount?.amount, "40.00");
    assert.equal(pay.payment_type, "Check");

    const claim = mapOdClaim({
      ClaimNum: 44,
      PatNum: 3,
      PlanNum: 2,
      ClaimStatus: "R",
      DateService: "2024-02-01",
      DateSent: "2024-02-02",
      DateReceived: "2024-02-10",
      ClaimFee: 100,
      InsPayEst: 80,
      InsPayAmt: 75,
      WriteOff: 5,
      ProvTreat: 1,
      ClinicNum: 0,
      DateTStamp: null,
    });
    assert.equal(claim.status, "received");
    assert.equal(claim.totals?.insurance_payment?.amount, "75.00");
  });

  it("maps patient geo + carrier without requiring PHI in warehouse", () => {
    const patient = mapOdPatient(
      {
        PatNum: 12,
        Guarantor: 12,
        FName: "Test",
        LName: "Patient",
        City: "Sherman",
        State: "TX",
        Zip: "75090",
        Birthdate: "1990-01-01",
        PatStatus: 0,
        ClinicNum: 1,
        DateTStamp: null,
        PriProv: 1,
      },
      "SoonerCare",
    );
    assert.equal(patient.id, 12);
    assert.equal(patient.inactive, false);
    assert.equal((patient.bio as { city?: string }).city, "Sherman");
    assert.deepEqual(patient.insurance_plans, [
      { name: "SoonerCare", ordinal: 1 },
    ]);
  });

  it("parses OD dates", () => {
    assert.equal(odDateToYmd("2024-05-06"), "2024-05-06");
    assert.ok(odDateToIso("2024-05-06 12:30:00")?.startsWith("2024-05-06T"));
    assert.equal(odDateToIso("0000-00-00"), null);
  });
});

