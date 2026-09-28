import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractOpenDentalProcCatId, buildProcedureCategoriesFromDescriptors } from "./procedure-categories";

describe("extractOpenDentalProcCatId", () => {
  it("reads ProcCat from source descriptor data", () => {
    assert.equal(
      extractOpenDentalProcCatId({
        code: "D7140",
        data: { ProcCat: 74 },
      }),
      74,
    );
  });
});

describe("buildProcedureCategoriesFromDescriptors", () => {
  it("groups descriptors by ProcCat and preserves existing names", () => {
    const categories = buildProcedureCategoriesFromDescriptors(
      [
        {
          code: "D7140",
          name: "Extraction, erupted tooth",
          data: { ProcCat: 74 },
        },
        {
          code: "D7111",
          name: "Extraction coronal remnants",
          data: { ProcCat: 74 },
        },
        {
          code: "D6010",
          name: "Surgical placement of implant body",
          data: { ProcCat: 79 },
        },
      ],
      [{ procCatId: 74, name: "Extractions", hidden: false, codeCount: 1 }],
    );

    assert.deepEqual(
      categories.map((c) => ({ id: c.procCatId, name: c.name })),
      [
        { id: 74, name: "Extractions" },
        { id: 79, name: "Implants" },
      ],
    );
  });
});
