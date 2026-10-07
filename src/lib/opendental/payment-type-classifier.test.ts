import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPaymentTypeDefMaps,
  insurancePaymentTypeDefNums,
} from "@/lib/opendental/payment-type-classifier";
import type { OdDefinitionRow } from "@/lib/opendental/types";

/** Open Dental PayType definitions (definition.Category = 10). */
function payType(DefNum: number, ItemName: string): OdDefinitionRow {
  return {
    DefNum,
    Category: 10,
    ItemName,
    ItemValue: "",
    ItemOrder: 0,
    IsHidden: 0,
  };
}

describe("insurancePaymentTypeDefNums", () => {
  it("includes insurance PayTypes and excludes Soonercare labels", () => {
    const ids = insurancePaymentTypeDefNums([
      payType(72, "Ins. Check"),
      payType(373, "Insurance Credit Card Payment "),
      payType(390, "Traditional SoonerCare"),
      payType(446, "DentaQuest"),
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
      payType(69, "Check"),
      payType(355, "CareCredit"),
      payType(446, "DentaQuest"),
      payType(505, "HFD "),
      payType(72, "Ins. Check"),
    ]);
    assert.equal(maps.cash.has(69), true);
    assert.equal(maps.financed.has(355), true);
    assert.equal(maps.financed.has(505), true);
    assert.equal(maps.soonercare.has(446), true);
    assert.equal(maps.insurance.has(72), true);
  });
});
