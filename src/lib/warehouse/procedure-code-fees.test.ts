import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProcedureCodeFees,
  orderFeeSchedules,
} from "@/lib/warehouse/procedure-code-fees";

describe("orderFeeSchedules", () => {
  it("puts Office Fees first", () => {
    const ordered = orderFeeSchedules([
      { id: 2, name: "Insurance A", active: true },
      { id: 1, name: "Office Fees", active: true },
    ]);
    assert.equal(ordered[0]?.name, "Office Fees");
  });
});

describe("buildProcedureCodeFees", () => {
  it("maps T and D codes to fee slots", () => {
    const result = buildProcedureCodeFees(
      [
        { id: 10, name: "Office Fees", active: true },
        { id: 20, name: "Insurance", active: true },
      ],
      [
        {
          code: "T3541",
          fee_schedule_id: 10,
          fee: { amount: "3.00", currency: "USD" },
        },
        {
          code: "D7140.1",
          fee_schedule_id: 10,
          fee: { amount: "20.00", currency: "USD" },
        },
        {
          code: "D7140.1",
          fee_schedule_id: 20,
          fee: { amount: "15.00", currency: "USD" },
        },
      ],
    );

    assert.deepEqual(result.names, ["Office Fees", "Insurance", null]);
    assert.deepEqual(result.byCode.get("T3541"), {
      fee1: "3.00",
      fee2: null,
      fee3: null,
    });
    assert.deepEqual(result.byCode.get("D7140.1"), {
      fee1: "20.00",
      fee2: "15.00",
      fee3: null,
    });
  });
});
