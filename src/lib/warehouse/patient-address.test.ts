import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PatientRecord } from "@/lib/warehouse/types";
import {
  extractPatientAddress,
  formatGeocodeQuery,
  hasGeocodableAddress,
  mergePatientAddress,
  resolvePatientAddress,
} from "@/lib/warehouse/patient-address";
import {
  aggregateProductionCentsByCity,
  UNKNOWN_ADDRESS_LABEL,
} from "@/lib/warehouse/geo-production";
import type { ChargeRecord } from "@/lib/warehouse/types";

describe("patient address enrichment", () => {
  it("reads city/state/ZIP from source bio (street is not geocoded)", () => {
    const addr = extractPatientAddress({
      id: 1,
      bio: {
        address_line_1: "125 Satin Heights",
        city: "San Jose",
        state: "CA",
        zip_code: "95112",
      },
    } as PatientRecord);
    assert.equal(addr.city, "San Jose");
    assert.equal(addr.state, "CA");
    assert.equal(addr.postalCode, "95112");
    assert.equal(formatGeocodeQuery(addr), "San Jose, CA");
  });

  it("inherits guarantor city when dependent has none", () => {
    const guarantor = {
      id: 100,
      bio: {
        address_line_1: "125 Satin Heights",
        city: "San Jose",
        state: "CA",
        zip_code: "95112",
      },
    } as PatientRecord;
    const dependent = {
      id: 101,
      guarantor_id: 100,
      bio: { address_line_1: "", city: "", state: "" },
    } as PatientRecord;
    const bySourceId = new Map<number, PatientRecord>([
      [100, guarantor],
      [101, dependent],
    ]);
    const addr = resolvePatientAddress(dependent, bySourceId);
    assert.equal(addr.city, "San Jose");
  });

  it("merges partial address fields without overwriting present values", () => {
    const merged = mergePatientAddress(
      { addressLine: null, city: "Dallas", state: null, postalCode: null, county: null, latitude: null, longitude: null },
      { addressLine: "3652 Memory Lane", city: "Dallas", state: "TX", postalCode: "75201", county: null, latitude: null, longitude: null },
    );
    assert.equal(merged.city, "Dallas");
    assert.equal(merged.state, "TX");
  });

  it("geocodes city/state only — not freeform street lines", () => {
    const cityState = {
      addressLine: "100 Main St",
      city: "Sherman",
      state: "TX",
      postalCode: "75090",
      county: null,
      latitude: null,
      longitude: null,
    };
    assert.equal(hasGeocodableAddress(cityState), true);
    assert.equal(formatGeocodeQuery(cityState), "Sherman, TX");

    const streetOnly = {
      addressLine: "India",
      city: null,
      state: null,
      postalCode: null,
      county: null,
      latitude: null,
      longitude: null,
    };
    assert.equal(hasGeocodableAddress(streetOnly), false);
    assert.equal(formatGeocodeQuery(streetOnly), null);
  });

  it("keeps production when city, state, and ZIP are blank", () => {
    const byCity = aggregateProductionCentsByCity(
      [{ patientId: 1, city: null, state: null, zip: null }],
      [
        {
          patient_id: 1,
          fee: { amount: "35.00" },
          charged_at: "2026-02-01",
        } as ChargeRecord,
      ],
      { start: "2026-01-01", end: "2026-10-09" },
    );
    assert.equal(byCity.get(UNKNOWN_ADDRESS_LABEL), 3500);
  });
});
