import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCdtLookupFromDocs,
  emptyCdtLookup,
  type CdtCodeRow,
} from "@/lib/cdt/categories";
import type { NexPatient } from "@/lib/nexhealth/client";
import { summarizeProductionFromLedger } from "@/lib/nexhealth/production";
import {
  buildSoonerCarePatientSet,
  extractPrimaryInsuranceCarrier,
  isScChartDescription,
  isScProductionCharge,
  isSoonerCareCarrier,
} from "@/lib/nexhealth/sc-production";

const scCdt = createCdtLookupFromDocs([
  {
    code: "D1110.1",
    category: "Hygiene",
    description: "SC Prophy",
  },
  {
    code: "D5110.1",
    category: "Dentures",
    description: "6-Month Denture",
    volumeBucket: "dentures",
    warrantyBucket: "m6",
  },
  {
    code: "D6010",
    category: "Implants",
    description: "Surgical placement of implant body",
  },
] satisfies CdtCodeRow[]);

describe("isScChartDescription", () => {
  it("matches SC-prefixed chart descriptions", () => {
    assert.equal(isScChartDescription("SC Prophy"), true);
    assert.equal(isScChartDescription("SC - Ext Comp Bony"), true);
    assert.equal(isScChartDescription("6-Month Denture"), false);
  });
});

describe("isSoonerCareCarrier", () => {
  it("matches SoonerCare and Medicaid carrier names", () => {
    assert.equal(isSoonerCareCarrier("SoonerCare"), true);
    assert.equal(isSoonerCareCarrier("OK Medicaid"), true);
    assert.equal(isSoonerCareCarrier("Delta Dental"), false);
  });
});

describe("buildSoonerCarePatientSet", () => {
  it("accepts slim warehouse carrier records (no bio)", () => {
    const set = buildSoonerCarePatientSet([
      { id: 7, primaryInsuranceCarrier: "SoonerCare" },
      { id: 8, primaryInsuranceCarrier: "Delta Dental" },
    ]);
    assert.deepEqual([...set], [7]);
  });
});

describe("extractPrimaryInsuranceCarrier", () => {
  it("reads nested bio primary insurance", () => {
    const carrier = extractPrimaryInsuranceCarrier({
      id: 1,
      bio: {
        primary_insurance: {
          carrier_name: "SoonerCare",
        },
      },
    } as NexPatient);
    assert.equal(carrier, "SoonerCare");
  });
});

describe("isScProductionCharge", () => {
  it("flags SC chart codes but not denture warranty suffixes", () => {
    assert.equal(
      isScProductionCharge({
        code: "D1110.1",
        chargeName: "SC Prophy",
        patientId: 99,
        soonerCarePatients: new Set(),
        cdt: scCdt,
      }),
      true,
    );
    assert.equal(
      isScProductionCharge({
        code: "D5110.1",
        chargeName: "6-Month Denture",
        patientId: 99,
        soonerCarePatients: new Set(),
        cdt: scCdt,
      }),
      false,
    );
  });

  it("flags any production for SoonerCare patients", () => {
    assert.equal(
      isScProductionCharge({
        code: "D6010",
        chargeName: "Surgical placement of implant body",
        patientId: 42,
        soonerCarePatients: new Set([42]),
        cdt: scCdt,
      }),
      true,
    );
  });
});

describe("summarizeProductionFromLedger scProductionCents", () => {
  it("sums SC production from chart codes and patient carrier", () => {
    const patients: NexPatient[] = [
      { id: 42, bio: { insurance_carrier: "SoonerCare" } },
    ];
    assert.deepEqual([...buildSoonerCarePatientSet(patients)], [42]);

    const summary = summarizeProductionFromLedger({
      fromYmd: "2026-01-01",
      toYmd: "2026-12-31",
      procedures: [],
      charges: [
        {
          id: 1,
          charged_at: "2026-02-01T10:00:00Z",
          procedure_code: "D1110.1",
          description: "SC Prophy",
          fee: { amount: "60.00" },
          provider_id: 7,
        },
        {
          id: 2,
          charged_at: "2026-02-02T10:00:00Z",
          procedure_code: "D6010",
          description: "Implant",
          fee: { amount: "100.00" },
          provider_id: 7,
          patient_id: 42,
        },
        {
          id: 3,
          charged_at: "2026-02-03T10:00:00Z",
          procedure_code: "D5110.1",
          description: "6-Month Denture",
          fee: { amount: "50.00" },
          provider_id: 7,
        },
      ],
      payments: [],
      adjustments: [],
      patients,
      cdt: scCdt,
    });

    assert.equal(summary.scProductionCents, 16000);
    assert.equal(summary.grossProductionCents, 21000);
    assert.equal(summary.byProvider.get(7)?.scProductionCents, 16000);
  });
});

describe("summarizeProductionFromLedger without patients", () => {
  it("still counts SC chart codes when patient sync is omitted", () => {
    const summary = summarizeProductionFromLedger({
      fromYmd: "2026-01-01",
      toYmd: "2026-12-31",
      procedures: [],
      charges: [
        {
          id: 1,
          charged_at: "2026-02-01T10:00:00Z",
          procedure_code: "D1110.1",
          description: "SC Prophy",
          fee: { amount: "60.00" },
        },
      ],
      payments: [],
      adjustments: [],
      cdt: scCdt,
    });
    assert.equal(summary.scProductionCents, 6000);
  });
});
