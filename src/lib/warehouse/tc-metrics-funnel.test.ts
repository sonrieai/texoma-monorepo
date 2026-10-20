import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCdtLookupFromDocs } from "@/lib/cdt/categories";
import { emptyConversionSummary } from "@/lib/warehouse/conversion";
import {
  buildPatientConversionFunnel,
  summarizeTcMetrics,
} from "@/lib/warehouse/tc-metrics";

describe("buildPatientConversionFunnel", () => {
  it("nested counts: showed and closed are subsets of presented patients", () => {
    const stages = buildPatientConversionFunnel({
      presentedPatients: new Set([1, 2, 3]),
      consultShowPatients: new Set([1, 2, 4]),
      closedPatients: new Set([1, 5]),
    });
    assert.deepEqual(stages, [
      { label: "Plans presented", value: 3 },
      { label: "Showed", value: 2 },
      { label: "Closed", value: 1 },
    ]);
  });

  it("falls back to consult-show cohort when no plan patients", () => {
    const stages = buildPatientConversionFunnel({
      presentedPatients: new Set(),
      consultShowPatients: new Set([10, 11]),
      closedPatients: new Set([10]),
    });
    assert.deepEqual(stages, [
      { label: "Plans presented", value: 2 },
      { label: "Showed", value: 2 },
      { label: "Closed", value: 1 },
    ]);
  });
});

describe("summarizeTcMetrics conversionFunnel", () => {
  it("links plans, consult shows, and closes by patient id", () => {
    const consultType = { id: 10, name: "NP Consult" };
    const cdt = createCdtLookupFromDocs([
      {
        code: "N9310",
        category: "Hygiene",
        description: "Consult",
        isConsult: true,
      },
    ]);

    const tc = summarizeTcMetrics({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      appointments: [
        {
          id: 1,
          patient_id: 1,
          appointment_type_id: 10,
          start_time: "2026-08-10T14:00:00+0000",
          apt_status: "Complete",
        },
        {
          id: 2,
          patient_id: 2,
          appointment_type_id: 10,
          start_time: "2026-08-11T14:00:00+0000",
          apt_status: "Complete",
        },
      ],
      appointmentTypes: [consultType],
      appointmentTypeDocs: [{ sourceId: 10, isNpConsult: true }],
      plans: [
        {
          id: 1,
          patient_id: 1,
          status: "accepted",
          updated_at: "2026-08-12T00:00:00Z",
          procedures: [
            {
              id: 1,
              status: "completed",
              fee: { amount: "100.00" },
              start_date: "2026-08-12",
            },
          ],
        },
        {
          id: 2,
          patient_id: 2,
          status: "accepted",
          updated_at: "2026-08-12T00:00:00Z",
          procedures: [
            {
              id: 2,
              status: "existing",
              fee: { amount: "200.00" },
              start_date: "2026-08-12",
            },
          ],
        },
        {
          id: 3,
          patient_id: 3,
          status: "proposed",
          updated_at: "2026-08-15T00:00:00Z",
          procedures: [
            {
              id: 3,
              status: "existing",
              fee: { amount: "50.00" },
              start_date: "2026-08-15",
            },
          ],
        },
      ],
      procedures: [
        {
          id: 9,
          patient_id: 1,
          code: "N9210",
          status: "Complete",
          start_date: "2026-08-10",
        },
        {
          id: 10,
          patient_id: 1,
          code: "D7777",
          status: "Complete",
          start_date: "2026-08-10",
          fee: { amount: "100.00" },
        },
        {
          id: 11,
          patient_id: 2,
          code: "N9410",
          status: "Complete",
          start_date: "2026-08-11",
        },
        {
          id: 12,
          patient_id: 2,
          code: "D7777",
          status: "Complete",
          start_date: "2026-08-11",
          fee: { amount: "200.00" },
        },
        {
          id: 13,
          patient_id: 3,
          provider_id: 8,
          code: "D7777",
          status: "Complete",
          start_date: "2026-08-15",
          fee: { amount: "50.00" },
        },
      ],
      providers: [{ id: 8, name: "Brie" }],
      payments: [],
      conversion: emptyConversionSummary(),
      cdt,
    });

    assert.deepEqual(tc.conversionFunnel, [
      { label: "Plans presented", value: 3 },
      { label: "Showed", value: 2 },
      { label: "Closed", value: 1 },
    ]);
    assert.equal(tc.tpPresentedCount, 3);
    assert.equal(tc.tpAcceptedCount, 1);
  });
});
