import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPresentedPlans,
  namedTreatmentCoordinators,
} from "@/lib/tc/presented-plans";

describe("collectPresentedPlans", () => {
  const providers = [
    { id: 4, name: "Ashlie Carter" },
    { id: 8, name: "Brie Nolan" },
    { id: 2, name: "Mehrad Sadeghpour" },
  ];

  it("counts completed D7777 and attributes Ashlie or Brie from the visit code", () => {
    const presented = collectPresentedPlans({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      providers,
      procedures: [
        {
          id: 1,
          patient_id: 10,
          provider_id: 2,
          appointment_id: 100,
          code: "N9210-Ashlie",
          status: "Complete",
          start_date: "2026-08-10",
        },
        {
          id: 2,
          patient_id: 10,
          provider_id: 2,
          appointment_id: 100,
          code: "D7777",
          status: "Complete",
          start_date: "2026-08-10",
          fee: { amount: "1200.00" },
        },
        {
          id: 3,
          patient_id: 11,
          provider_id: 8,
          code: "D7777",
          status: "Complete",
          start_date: "2026-08-12",
          fee: { amount: "800.00" },
        },
        {
          id: 4,
          patient_id: 12,
          provider_id: 2,
          code: "D7777",
          status: "Complete",
          start_date: "2026-07-01",
        },
        {
          id: 5,
          patient_id: 13,
          code: "D6010",
          status: "Complete",
          start_date: "2026-08-12",
        },
      ],
    });

    assert.deepEqual(
      presented.map((row) => ({
        patientId: row.patientId,
        coordinatorName: row.coordinatorName,
        cents: row.cents,
      })),
      [
        { patientId: 10, coordinatorName: "Ashlie", cents: 120000 },
        { patientId: 11, coordinatorName: "Brie", cents: 80000 },
      ],
    );
  });

  it("uses the same-day coordinator code when the visit id is missing", () => {
    const presented = collectPresentedPlans({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      procedures: [
        {
          patient_id: 20,
          code: "N9410-Brie",
          status: "Complete",
          start_date: "2026-08-04",
        },
        {
          patient_id: 20,
          code: "D7777",
          status: "Complete",
          start_date: "2026-08-04",
        },
      ],
    });
    assert.equal(presented.length, 1);
    assert.equal(presented[0]?.coordinatorName, "Brie");
  });
});

describe("namedTreatmentCoordinators", () => {
  it("is only Ashlie and Brie", () => {
    const roster = namedTreatmentCoordinators([
      { id: 1, name: "Office" },
      { id: 4, name: "Ashlie" },
    ]);
    assert.deepEqual(
      roster.map((row) => row.name),
      ["Ashlie", "Brie"],
    );
    assert.deepEqual(roster[0]?.attributionIds, [4]);
    assert.deepEqual(roster[1]?.attributionIds, []);
  });
});
