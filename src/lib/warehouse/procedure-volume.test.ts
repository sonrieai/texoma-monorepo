import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCdtLookupFromDocs } from "@/lib/cdt/categories";
import {
  accumulateProcedureVolume,
  isDentureDeliveryProcedureCode,
  isRemakeProcedureCode,
} from "@/lib/warehouse/procedure-volume";
import { emptyProcedureVolume } from "@/lib/warehouse/production";
import type { ProcedureRecord } from "@/lib/warehouse/types";

describe("isRemakeProcedureCode", () => {
  it("detects D5511 and remake descriptions", () => {
    assert.equal(isRemakeProcedureCode("D5511", ""), true);
    assert.equal(
      isRemakeProcedureCode("N9999", "denture remake upper"),
      true,
    );
    assert.equal(isRemakeProcedureCode("D5110", "Complete denture"), false);
  });
});

describe("isDentureDeliveryProcedureCode", () => {
  it("accepts D5110/D5120 and rejects N4120 markers", () => {
    assert.equal(isDentureDeliveryProcedureCode("D5110"), true);
    assert.equal(isDentureDeliveryProcedureCode("D5120.1"), true);
    assert.equal(isDentureDeliveryProcedureCode("N4120"), false);
  });
});

describe("accumulateProcedureVolume", () => {
  const cdt = createCdtLookupFromDocs([
    {
      code: "U-AOXS",
      description: "sold",
      category: "Fixed (All-on-4)",
      volumeBucket: "aox",
      isSoldCase: true,
    },
    {
      code: "D6114",
      description: "aox proc",
      category: "Fixed (All-on-4)",
      volumeBucket: "aox",
    },
    {
      code: "D5110",
      description: "denture",
      category: "Dentures",
      volumeBucket: "dentures",
    },
    {
      code: "N4120",
      description: "delivery marker",
      category: "Dentures",
      volumeBucket: "dentures",
    },
  ]);

  it("counts all-on procedure codes without a sold-case flag", () => {
    const volume = emptyProcedureVolume();
    const procedures: ProcedureRecord[] = [
      {
        id: 1,
        code: "U-AOXS",
        status: "completed",
        start_date: "2026-06-01",
        fee: { amount: "1" },
      },
      {
        id: 2,
        code: "D6114",
        status: "completed",
        start_date: "2026-06-02",
        fee: { amount: "1" },
      },
    ];
    accumulateProcedureVolume({
      cdt,
      procedures,
      fromYmd: "2026-01-01",
      toYmd: "2026-12-31",
      volume,
    });
    assert.equal(volume.aox, 2);
  });

  it("excludes N4120 from denture delivery volume", () => {
    const volume = emptyProcedureVolume();
    accumulateProcedureVolume({
      cdt,
      procedures: [
        {
          id: 1,
          code: "D5110",
          status: "completed",
          start_date: "2026-06-01",
          fee: { amount: "1" },
        },
        {
          id: 2,
          code: "N4120",
          status: "completed",
          start_date: "2026-06-02",
          fee: { amount: "1" },
        },
      ],
      fromYmd: "2026-01-01",
      toYmd: "2026-12-31",
      volume,
    });
    assert.equal(volume.dentures, 1);
  });

  it("counts repair codes as remakes not deliveries", () => {
    const volume = emptyProcedureVolume();
    accumulateProcedureVolume({
      cdt,
      procedures: [
        {
          id: 3,
          code: "D5511",
          status: "completed",
          start_date: "2026-06-03",
          fee: { amount: "1" },
        },
      ],
      fromYmd: "2026-01-01",
      toYmd: "2026-12-31",
      volume,
    });
    assert.equal(volume.remakes, 1);
    assert.equal(volume.dentures, 0);
  });
});
