import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NexPatient } from "@/lib/nexhealth/client";
import {
  containsPhiKeys,
  omitPhiKeys,
  slimNexClaim,
  slimNexPayment,
  stripPhiFromNexPatient,
} from "@/lib/mongo/phi-policy";

const samplePatient = {
  id: 123,
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  inactive: false,
  bio: {
    phone_number: "5551234567",
    ssn: "111-22-3333",
    date_of_birth: "1990-01-01",
    address_line_1: "100 Main St",
    city: "Sherman",
    state: "TX",
    zip_code: "75090",
    primary_insurance: { carrier_name: "SoonerCare" },
  },
} as NexPatient;

describe("omitPhiKeys", () => {
  it("drops name, contact, bio, and nested patient objects", () => {
    const slim = omitPhiKeys({
      id: 1,
      first_name: "A",
      email: "a@b.c",
      patient_id: 9,
      patient: { first_name: "A" },
      start_time: "2026-01-01T00:00:00Z",
    });
    assert.equal(slim.id, 1);
    assert.equal(slim.patient_id, 9);
    assert.equal(slim.start_time, "2026-01-01T00:00:00Z");
    assert.equal("first_name" in slim, false);
    assert.equal("email" in slim, false);
    assert.equal("patient" in slim, false);
    assert.equal(containsPhiKeys(slim), false);
  });
});

describe("stripPhiFromNexPatient", () => {
  it("keeps id, carrier, and city/state/zip — never names or street", () => {
    const slim = stripPhiFromNexPatient(samplePatient);
    assert.ok(slim);
    assert.equal(slim.patientId, 123);
    assert.equal(slim.primaryInsuranceCarrier, "SoonerCare");
    assert.equal(slim.geoCity, "Sherman");
    assert.equal(slim.geoState, "TX");
    assert.equal(slim.geoZip, "75090");
    assert.equal("firstName" in slim, false);
    assert.equal("email" in slim, false);
    const rec = slim as unknown as Record<string, unknown>;
    assert.equal(rec.geoStreet, undefined);
    assert.equal(containsPhiKeys(slim as unknown as Record<string, unknown>), false);
  });
});

describe("slim ledger entities", () => {
  it("nulls payment notes and claim notes", () => {
    const payment = slimNexPayment({
      id: 1,
      patient_id: 2,
      notes: "Called Jane at 555",
      description: "Visa",
    });
    assert.equal(payment.notes, null);
    assert.equal(payment.description, "Visa");
    assert.equal(payment.patient_id, 2);

    const claim = slimNexClaim({
      id: 8,
      patient_id: 2,
      note: "SSN on file",
      status: "sent",
    });
    assert.equal(claim.note, null);
    assert.equal(claim.status, "sent");
  });
});
