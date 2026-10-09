import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExcludedDoctorProvider } from "./excluded-doctor-providers";

describe("isExcludedDoctorProvider", () => {
  it("excludes office and line placeholders", () => {
    assert.equal(isExcludedDoctorProvider("Office"), true);
    assert.equal(isExcludedDoctorProvider("  dent "), true);
    assert.equal(isExcludedDoctorProvider("SNAP-IN"), true);
    assert.equal(isExcludedDoctorProvider("Snap In"), true);
    assert.equal(isExcludedDoctorProvider("FIXED"), true);
  });

  it("keeps clinicians", () => {
    assert.equal(isExcludedDoctorProvider("Mehrad Sadeghpour"), false);
    assert.equal(isExcludedDoctorProvider("Paola Pinzon"), false);
    assert.equal(isExcludedDoctorProvider("Amin Heravi"), false);
    assert.equal(isExcludedDoctorProvider("Katie Yahn"), false);
    assert.equal(isExcludedDoctorProvider("Dentures"), false);
  });
});
