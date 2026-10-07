/**
 * Unit tests for Open Dental → warehouse mappers (synthetic, non-PHI).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapOdAppointment,
  mapOdClaim,
  odClaimNeedsCorrection,
  mapOdGuarantorBalance,
  mapOdPatient,
  mapOdPaySplit,
  mapOdTreatPlan,
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

  it("maps treat plan lines from linked procedurelog status", () => {
    const plan = mapOdTreatPlan(
      {
        TreatPlanNum: 1,
        PatNum: 2,
        DateTP: "2026-03-01",
        Heading: "Full arch",
        TPStatus: 0,
        DateTStamp: null,
      },
      [
        {
          ProcTPNum: 10,
          TreatPlanNum: 1,
          PatNum: 2,
          ProcNumOrig: 900,
          ProcCode: "D6010",
          Descript: "implant",
          FeeAmt: 500,
          Priority: 0,
          LogProcStatus: OdProcStatus.Complete,
          LogProcDate: "2026-03-15",
          LogDateComplete: "2026-03-15",
        },
      ],
    );
    assert.equal(plan.procedures?.[0]?.status, "Complete");
  });

  it("normalizes guarantor total from aging when EstBalance is negative", () => {
    const row = mapOdGuarantorBalance({
      PatNum: 1,
      Bal_0_30: 100,
      Bal_31_60: 50,
      Bal_61_90: 25,
      BalOver90: 75,
      InsEst: 0,
      TotBal: -1000,
      EstBalance: -1000,
    });
    assert.equal(row.total_balance?.amount, "250.00");
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
    assert.equal(claim.needs_correction, false);
  });

  it("flags correction from DateSentOrig or CorrectionType", () => {
    assert.equal(
      odClaimNeedsCorrection({
        ClaimNum: 1,
        PatNum: 1,
        PlanNum: 1,
        ClaimStatus: "R",
        ClaimType: "P",
        DateService: "2026-01-01",
        DateSent: "2026-02-01",
        DateSentOrig: "2026-01-15",
        DateReceived: "2026-02-10",
        DateResent: "0001-01-01",
        ClaimFee: 0,
        InsPayEst: 0,
        InsPayAmt: 0,
        WriteOff: 0,
        CorrectionType: 0,
        ProvTreat: 1,
        ClinicNum: 0,
        DateTStamp: null,
      }),
      true,
    );
    assert.equal(
      odClaimNeedsCorrection({
        ClaimNum: 2,
        PatNum: 1,
        PlanNum: 1,
        ClaimStatus: "R",
        ClaimType: "P",
        DateService: "2026-01-01",
        DateSent: "2026-02-01",
        DateSentOrig: "2026-02-01",
        DateReceived: "2026-02-10",
        DateResent: "0001-01-01",
        ClaimFee: 0,
        InsPayEst: 0,
        InsPayAmt: 0,
        WriteOff: 0,
        CorrectionType: 1,
        ProvTreat: 1,
        ClinicNum: 0,
        DateTStamp: null,
      }),
      true,
    );
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

