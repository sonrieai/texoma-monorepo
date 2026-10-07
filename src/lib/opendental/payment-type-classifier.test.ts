import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPaymentTypeDefMaps,
  insurancePaymentTypeDefNums,
} from "@/lib/opendental/payment-type-classifier";

describe("insurancePaymentTypeDefNums", () => {
  it("includes insurance PayTypes and excludes Soonercare labels", () => {
    const ids = insurancePaymentTypeDefNums([
      { DefNum: 72, ItemName: "Ins. Check", IsHidden: 0 },
      { DefNum: 373, ItemName: "Insurance Credit Card Payment ", IsHidden: 0 },
      { DefNum: 390, ItemName: "Traditional SoonerCare", IsHidden: 0 },
      { DefNum: 446, ItemName: "DentaQuest", IsHidden: 0 },
    ]);
    assert.equal(ids.has(72), true);
    assert.equal(ids.has(373), true);
    assert.equal(ids.has(390), false);
    assert.equal(ids.has(446), false);
  });
});

describe("buildPaymentTypeDefMaps", () => {
  it("maps Texoma PayTypes to mix buckets", () => {
    const maps = buildPaymentTypeDefMaps([
      { DefNum: 69, ItemName: "Check", IsHidden: 0 },
      { DefNum: 355, ItemName: "CareCredit", IsHidden: 0 },
      { DefNum: 446, ItemName: "DentaQuest", IsHidden: 0 },
      { DefNum: 505, ItemName: "HFD ", IsHidden: 0 },
      { DefNum: 72, ItemName: "Ins. Check", IsHidden: 0 },
    ]);
    assert.equal(maps.cash.has(69), true);
    assert.equal(maps.financed.has(355), true);
    assert.equal(maps.financed.has(505), true);
    assert.equal(maps.soonercare.has(446), true);
    assert.equal(maps.insurance.has(72), true);
  });
});
