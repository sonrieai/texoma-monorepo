import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NexPatient } from "@/lib/nexhealth/client";
import {
  formatGeocodeQuery,
  hasGeocodableAddress,
  mergePatientAddress,
  resolvePatientAddress,
} from "@/lib/nexhealth/patient-address";
import { mapPatientDirectoryRow } from "@/lib/nexhealth/patients";

describe("patient address enrichment", () => {
  it("reads home/work/cell phone fields from NexHealth bio", () => {
    const row = mapPatientDirectoryRow({
      id: 1,
      first_name: "Patty",
      last_name: "PPO",
      bio: {
        phone_number: "",
        home_phone_number: "2345677545",
        work_phone_number: "5212586511",
      },
    } as NexPatient);
    assert.equal(row.phone, "2345677545");
  });

  it("inherits guarantor address when dependent has none", () => {
    const guarantor = {
      id: 100,
      bio: {
        address_line_1: "125 Satin Heights",
        city: "San Jose",
        state: "CA",
        zip_code: "95112",
      },
    } as NexPatient;
    const dependent = {
      id: 101,
      guarantor_id: 100,
      bio: { address_line_1: "", city: "", state: "" },
    } as NexPatient;
    const byNexId = new Map<number, NexPatient>([
      [100, guarantor],
      [101, dependent],
    ]);
    const addr = resolvePatientAddress(dependent, byNexId);
    assert.equal(addr.city, "San Jose");
    assert.equal(addr.addressLine, "125 Satin Heights");
  });

  it("merges partial address fields without overwriting present values", () => {
    const merged = mergePatientAddress(
      { addressLine: null, city: "Dallas", state: null, postalCode: null, county: null, latitude: null, longitude: null },
      { addressLine: "3652 Memory Lane", city: "Dallas", state: "TX", postalCode: "75201", county: null, latitude: null, longitude: null },
    );
    assert.equal(merged.city, "Dallas");
    assert.equal(merged.state, "TX");
    assert.equal(merged.addressLine, "3652 Memory Lane");
  });

  it("geocodes freeform international address lines", () => {
    const addr = {
      addressLine: "India",
      city: null,
      state: null,
      postalCode: null,
      county: null,
      latitude: null,
      longitude: null,
    };
    assert.equal(hasGeocodableAddress(addr), true);
    assert.equal(formatGeocodeQuery(addr), "India");
  });
});
