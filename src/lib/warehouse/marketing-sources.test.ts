import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CdtLookup } from "@/lib/cdt/categories";
import {
  assembleMarketingSummary,
  emptyMarketingSummary,
  mergeMarketingSources,
  referralSourceLabel,
  sourceByPatient,
  summarizeOdMarketing,
  type ReferralAttach,
} from "@/lib/warehouse/marketing-sources";
import type { AppointmentRecord, ProcedureRecord } from "@/lib/warehouse/types";

const cdt = {
  isConsultCode: (code: string | null | undefined) => code === "D9310",
  isAoxSoldCode: () => false,
} as unknown as CdtLookup;

function attach(partial: Partial<ReferralAttach> & Pick<ReferralAttach, "patientId" | "lastName">): ReferralAttach {
  return {
    refDate: "2026-01-15",
    itemOrder: 0,
    attachId: partial.patientId,
    firstName: "",
    ...partial,
  };
}

function visit(patientId: number, ymd: string, status: string, confirm?: number): AppointmentRecord {
  return {
    patient_id: patientId,
    start_time: `${ymd}T15:00:00.000Z`,
    apt_status: status,
    appointment_status: status,
    status,
    confirmation_id: confirm,
  };
}

function fee(patientId: number, ymd: string, code: string, dollars: number): ProcedureRecord {
  return {
    patient_id: patientId,
    code,
    status: "Complete",
    start_date: ymd,
    fee: { amount: dollars.toFixed(2) },
  };
}

const period = {
  fromYmd: "2026-01-01",
  toYmd: "2026-10-13",
  appointmentsLoadedFromYmd: "2025-10-13",
};

describe("referralSourceLabel", () => {
  it("keeps a channel last name and buckets named people", () => {
    assert.equal(referralSourceLabel("Google", ""), "Google");
    assert.equal(referralSourceLabel("Facebook or Instagram", " "), "Facebook or Instagram");
    assert.equal(referralSourceLabel("Smith", "Jane"), "Patient referral");
    assert.equal(referralSourceLabel("  ", ""), "Unknown");
  });
});

describe("sourceByPatient", () => {
  it("picks the earliest ref date, then item order, and ignores ref type", () => {
    const chosen = sourceByPatient([
      attach({ patientId: 1, lastName: "Google", refDate: "2026-03-01", attachId: 10 }),
      attach({ patientId: 1, lastName: "TV", refDate: "2026-01-02", itemOrder: 5, attachId: 11 }),
      attach({ patientId: 1, lastName: "Radio", refDate: "2026-01-02", itemOrder: 1, attachId: 12 }),
      attach({ patientId: 2, lastName: "Lee", firstName: "Ann", attachId: 2 }),
    ]);
    assert.equal(chosen.get(1), "Radio");
    assert.equal(chosen.get(2), "Patient referral");
  });
});

describe("summarizeOdMarketing", () => {
  it("counts the new-patient funnel and older production on the same source", () => {
    const summary = summarizeOdMarketing({
      ...period,
      referrals: [
        attach({ patientId: 1, lastName: "Google" }),
        attach({ patientId: 3, lastName: "Google", refDate: "2024-05-01" }),
      ],
      patients: [
        { patientId: 1, dateFirstVisit: "2026-02-01" },
        { patientId: 2, dateFirstVisit: "2026-03-01" },
        { patientId: 3, dateFirstVisit: "2024-06-01" },
        { patientId: 4, dateFirstVisit: "2025-01-01" },
      ],
      appointments: [
        visit(1, "2026-02-02", "Complete"),
        visit(2, "2026-03-02", "Scheduled", 66),
        visit(1, "2026-02-01", "Scheduled"),
      ],
      procedures: [
        fee(1, "2026-02-02", "D9310", 0),
        fee(1, "2026-04-01", "D5110", 800),
        fee(1, "2026-05-01", "U-AOXS", 0),
        fee(3, "2026-06-01", "D5110", 1200),
      ],
      cdt,
    });

    const google = summary.channels.find((row) => row.name === "Google");
    const unknown = summary.channels.find((row) => row.name === "Unknown");
    assert.ok(google);
    assert.equal(google.leads, 1);
    assert.equal(google.booked, 1);
    assert.equal(google.showed, 1);
    assert.equal(google.accepted, 1);
    assert.equal(google.surgery, 1);
    assert.equal(google.production, 2000);
    assert.ok(unknown);
    assert.equal(unknown.leads, 1);
    assert.equal(unknown.booked, 0);
    assert.equal(summary.notices.length, 0);
  });

  it("notes when the period starts before loaded appointments", () => {
    const summary = summarizeOdMarketing({
      ...period,
      fromYmd: "2024-01-01",
      referrals: [],
      patients: [],
      appointments: [],
      procedures: [],
      cdt,
    });
    assert.match(summary.notices[0] ?? "", /2025-10-13/);
  });
});

describe("mergeMarketingSources", () => {
  it("keeps Open Dental counts, fills missing channels from GoHighLevel, and takes spend from GoHighLevel", () => {
    const openDental = assembleMarketingSummary({
      channels: [
        {
          name: "Google",
          spend: 0,
          leads: 4,
          booked: 3,
          showed: 2,
          accepted: 1,
          surgery: 1,
          production: 500,
        },
        {
          name: "Facebook or Instagram",
          spend: 0,
          leads: 3,
          booked: 2,
          showed: 2,
          accepted: 1,
          surgery: 0,
          production: 100,
        },
      ],
      notices: ["od"],
      lookbackDays: 90,
      showRate: null,
      responseMinutes: null,
      opportunityCount: 7,
    });
    const goHighLevel = assembleMarketingSummary({
      channels: [
        {
          name: "Google Ads",
          spend: 50,
          leads: 9,
          booked: 9,
          showed: 9,
          accepted: 9,
          surgery: 9,
          production: 9,
        },
        {
          name: "Facebook",
          spend: 10,
          leads: 8,
          booked: 8,
          showed: 8,
          accepted: 0,
          surgery: 0,
          production: 8,
        },
        {
          name: "Instagram",
          spend: 5,
          leads: 1,
          booked: 1,
          showed: 1,
          accepted: 0,
          surgery: 0,
          production: 1,
        },
        {
          name: "Mailers",
          spend: 0,
          leads: 2,
          booked: 1,
          showed: 1,
          accepted: 0,
          surgery: 0,
          production: 20,
        },
      ],
      notices: [],
      lookbackDays: 90,
      showRate: 0.2,
      responseMinutes: 12,
      opportunityCount: 20,
    });

    const merged = mergeMarketingSources({
      openDental,
      goHighLevel,
      consultShowRate: 0.8,
    });
    assert.equal(merged.funnelSource, "both");
    const google = merged.summary.channels.find((row) => row.name === "Google");
    const social = merged.summary.channels.find(
      (row) => row.name === "Facebook or Instagram",
    );
    const mailers = merged.summary.channels.find((row) => row.name === "Mailers");
    assert.equal(google?.leads, 4);
    assert.equal(google?.production, 500);
    assert.equal(google?.spend, 50);
    assert.equal(social?.leads, 3);
    assert.equal(social?.spend, 15);
    assert.equal(mailers?.leads, 2);
    assert.equal(mailers?.production, 20);
    assert.equal(merged.summary.showRate, 0.8);
    assert.equal(merged.summary.roi, 620 / 65);
  });

  it("falls back to GoHighLevel when Open Dental has no named referral", () => {
    const merged = mergeMarketingSources({
      openDental: emptyMarketingSummary(),
      goHighLevel: assembleMarketingSummary({
        channels: [
          {
            name: "Website",
            spend: 0,
            leads: 5,
            booked: 4,
            showed: 3,
            accepted: 1,
            surgery: 0,
            production: 40,
          },
        ],
        notices: [],
        lookbackDays: 30,
        showRate: null,
        responseMinutes: null,
        opportunityCount: 5,
      }),
      consultShowRate: null,
    });
    assert.equal(merged.funnelSource, "gohighlevel");
    assert.equal(merged.summary.channels[0]?.name, "Website");
    assert.equal(merged.summary.totals.leads, 5);
  });
});
