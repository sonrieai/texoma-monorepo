import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCdtLookupFromDocs } from "@/lib/cdt/categories";
import type { NexProcedure } from "@/lib/nexhealth/client";
import { accumulateProcedureVolume } from "@/lib/nexhealth/procedure-volume";
import { emptyProcedureVolume } from "@/lib/nexhealth/production";

describe("accumulateProcedureVolume", () => {
  it("counts only completed procedures with chart volumeBucket", () => {
    const cdt = createCdtLookupFromDocs([
      {
        code: "D6010",
        category: "Implants",
        description: "Implant",
        volumeBucket: "implants",
      },
      {
        code: "U-AOXS",
        category: "Fixed (All-on-4)",
        description: "AOX sold",
        volumeBucket: "aox",
        isSoldCase: true,
      },
    ]);
    const volume = emptyProcedureVolume();
    const procedures: NexProcedure[] = [
      {
        id: 1,
        code: "D6010",
        status: "completed",
        start_date: "2026-08-10",
      },
      {
        id: 2,
        code: "D6010",
        status: "scheduled",
        start_date: "2026-08-11",
      },
      {
        id: 3,
        code: "U-AOXS",
        status: "completed",
        start_date: "2026-08-12",
      },
    ];
    accumulateProcedureVolume({
      cdt,
      procedures,
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      volume,
    });
    assert.equal(volume.implants, 1);
    assert.equal(volume.aox, 1);
  });
});
