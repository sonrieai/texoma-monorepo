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
    assert.equal(inferWarrantyBucket("CODE", "partial 3 yr warranty"), "y3");
    assert.equal(inferWarrantyBucket("D5110", "standard denture"), null);
  });
});
