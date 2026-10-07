import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AdjustmentRecord } from "@/lib/warehouse/types";
import {
  buildAdjustmentTypeMap,
  defaultIncludeInAdjustedProduction,
  includeAdjustmentTypeInAdjustedProduction,
  isWriteOffAdjustment,
} from "@/lib/warehouse/adjusted-production";

describe("adjusted production types", () => {
  it("defaults write-offs to source credit action", () => {
    assert.equal(defaultIncludeInAdjustedProduction("credit"), true);
    assert.equal(defaultIncludeInAdjustedProduction("debit"), false);
    assert.equal(defaultIncludeInAdjustedProduction(null), false);
  });

  it("classifies OD adj type names for adjusted production", () => {
    assert.equal(
      includeAdjustmentTypeInAdjustedProduction("Insurance Write-off", "add"),
      true,
    );
    assert.equal(
      includeAdjustmentTypeInAdjustedProduction("Senior discount", "subtract"),
      false,
    );
  });

  it("matches types flagged includeInAdjustedProduction", () => {
    const typesById = buildAdjustmentTypeMap([
      { id: 5, name: "Insurance Write-off", includeInAdjustedProduction: true },
      { id: 9, name: "Senior discount", includeInAdjustedProduction: false },
    ]);
    const writeOff: AdjustmentRecord = {
      id: 1,
      adjustment_type_id: 5,
      adjustment_amount: { amount: "40.00" },
    };
    const discount: AdjustmentRecord = {
      id: 2,
      adjustment_type_id: 9,
      adjustment_amount: { amount: "10.00" },
    };

    assert.equal(isWriteOffAdjustment(writeOff, typesById), true);
    assert.equal(isWriteOffAdjustment(discount, typesById), false);
  });
});
