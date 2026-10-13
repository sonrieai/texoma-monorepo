import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferIsConsultCode,
  inferIsConsultFromCodeAndDescription,
  inferWarrantyBucket,
} from "@/lib/cdt/infer-procedure-category";

describe("inferIsConsultCode", () => {
  it("flags N9310 custom codes and D9310/D0150", () => {
    assert.equal(inferIsConsultCode("N9310 Dent Cons"), true);
    assert.equal(inferIsConsultCode("D9310"), true);
    assert.equal(inferIsConsultCode("D0150"), true);
    assert.equal(inferIsConsultCode("D2740"), false);
  });
});

describe("inferIsConsultFromCodeAndDescription", () => {
  it("matches Denture Consult description", () => {
    assert.equal(
      inferIsConsultFromCodeAndDescription("X999", "Denture Consult"),
      true,
    );
  });
});

describe("inferWarrantyBucket", () => {
  it("parses warranty hints from code and description", () => {
    assert.equal(inferWarrantyBucket("D5110.1YR", "upper denture"), "y1");
    assert.equal(inferWarrantyBucket("D5110.6MO", "complete denture"), "m6");
    assert.equal(inferWarrantyBucket("D5211.1YR", "partial denture"), "y1");
    assert.equal(inferWarrantyBucket("CODE", "partial 3 yr warranty"), "y3");
    assert.equal(inferWarrantyBucket("D5110", "standard denture"), null);
  });

  it("reads spelled Open Dental durations, including odd spacing", () => {
    assert.equal(inferWarrantyBucket("D5110.1", "6-Month Denture"), "m6");
    assert.equal(inferWarrantyBucket("D5110.11", "6-Month Dentures"), "m6");
    assert.equal(inferWarrantyBucket("D5110.3", "5-Year Denture"), "y5");
    assert.equal(inferWarrantyBucket("D5110.33", "5 -Year Dentures"), "y5");
    assert.equal(inferWarrantyBucket("D5110.4", "1-Year-Denture"), "y1");
    assert.equal(inferWarrantyBucket("D5110.22", "3 -Year Dentures"), "y3");
    assert.equal(inferWarrantyBucket("D5140.2", "3- Yr-/FR"), "y3");
    assert.equal(inferWarrantyBucket("N3334", "1 Year- Choctaw"), "y1");
    assert.equal(
      inferWarrantyBucket("N8888.1", "5 Yr Denture Warranty Pkg"),
      "y5",
    );
    assert.equal(inferWarrantyBucket("5130.33", "5Yr FR/"), "y5");
    assert.equal(inferWarrantyBucket("5140.11", "6 Mo /FR"), "m6");
  });

  it("uses the D5110–D5140 suffix when the description has no tier", () => {
    assert.equal(inferWarrantyBucket("D5110.1", "complete denture"), "m6");
    assert.equal(inferWarrantyBucket("D5110.11", ""), "m6");
    assert.equal(inferWarrantyBucket("5120.2", ""), "y3");
    assert.equal(inferWarrantyBucket("5130.22", ""), "y3");
    assert.equal(inferWarrantyBucket("D5140.3", ""), "y5");
    assert.equal(inferWarrantyBucket("5140.33", ""), "y5");
    assert.equal(inferWarrantyBucket("D5120.4", ""), "y1");
    assert.equal(inferWarrantyBucket("5110.44", ""), "y1");
  });

  it("leaves SoonerCare .5, unsuffixed deliveries, and unsuffixed N8888 unset", () => {
    assert.equal(inferWarrantyBucket("D5110", "complete denture - maxillary"), null);
    assert.equal(
      inferWarrantyBucket("D5110.5", "Complete Denture F/-SC"),
      null,
    );
    assert.equal(inferWarrantyBucket("D5130.5", "Immediate Fr/-SC"), null);
    assert.equal(inferWarrantyBucket("N8888", "Denture Warranty Pkg"), null);
    assert.equal(inferWarrantyBucket("N8888.1", ""), null);
  });

  it("lets the description beat the numeric suffix", () => {
    assert.equal(
      inferWarrantyBucket("N8888.1", "5 Yr Denture Warranty Pkg"),
      "y5",
    );
    assert.equal(inferWarrantyBucket("N8888.5", "6 Mo Denture Warranty Pkg"), "m6");
    assert.equal(inferWarrantyBucket("N8888.3", "1 Yr Denture Warranty Pkg"), "y1");
    assert.equal(inferWarrantyBucket("N8888.2", "3 Yr Denture Warranty Pkg"), "y3");
  });
});
