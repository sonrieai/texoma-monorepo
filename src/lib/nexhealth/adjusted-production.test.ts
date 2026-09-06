import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NexAdjustment } from "@/lib/nexhealth/client";
import {
  buildAdjustmentTypeMap,
  defaultIncludeInAdjustedProduction,
  isWriteOffAdjustment,
} from "@/lib/nexhealth/adjusted-production";

describe("adjusted production types", () => {
  it("defaults write-offs to NexHealth credit action", () => {
    assert.equal(defaultIncludeInAdjustedProduction("credit"), true);
    assert.equal(defaultIncludeInAdjustedProduction("debit"), false);
    assert.equal(defaultIncludeInAdjustedProduction(null), false);
  });

  it("matches types flagged includeInAdjustedProduction", () => {
    const typesById = buildAdjustmentTypeMap([
      { id: 5, name: "Insurance Write-off", includeInAdjustedProduction: true },
      { id: 9, name: "Senior discount", includeInAdjustedProduction: false },
    ]);
    const writeOff: NexAdjustment = {
      id: 1,
      adjustment_type_id: 5,
      adjustment_amount: { amount: "40.00" },
    };
    const discount: NexAdjustment = {
      id: 2,
      adjustment_type_id: 9,
      adjustment_amount: { amount: "10.00" },
    };

    assert.equal(isWriteOffAdjustment(writeOff, typesById), true);
    assert.equal(isWriteOffAdjustment(discount, typesById), false);
  });
});
