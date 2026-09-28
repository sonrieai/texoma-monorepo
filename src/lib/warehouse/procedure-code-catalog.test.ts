import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractProcedureCodeCatalog,
  extractProcedureCodeCatalogFromDescriptors,
  mergeProcedureCodeCatalogs,
} from "@/lib/warehouse/procedure-code-catalog";

describe("extractProcedureCodeCatalog", () => {
  it("dedupes codes from procedures and charges", () => {
    const catalog = extractProcedureCodeCatalog(
      [
        { code: "d6010", name: "Implant placement" },
        { code: "D6010", name: "Surgical placement of implant body" },
      ],
      [{ procedure_code: "D0120" }],
    );

    assert.deepEqual([...catalog.keys()].sort(), ["D0120", "D6010"]);
    assert.equal(catalog.get("D6010"), "Surgical placement of implant body");
    assert.equal(catalog.get("D0120"), "D0120");
  });
});

describe("extractProcedureCodeCatalogFromDescriptors", () => {
  it("includes decimal subcodes from Open Dental master list", () => {
    const catalog = extractProcedureCodeCatalogFromDescriptors([
      {
        code: "D7140.1",
        name: "Simple w/o dentures",
        descriptor_type: "Procedure Codes",
        active: true,
      },
      {
        code: "D7140",
        name: "Extraction, erupted tooth or exposed root",
        descriptor_type: "Procedure Codes",
        active: true,
      },
      {
        code: "NPR",
        name: "New patient visit",
        descriptor_type: "Opendental Appointment Types",
        active: true,
      },
      {
        code: "~BAD~",
        name: "Invalid procedure",
        descriptor_type: "Procedure Codes",
        active: true,
      },
    ]);

    assert.deepEqual([...catalog.keys()].sort(), ["D7140", "D7140.1"]);
    assert.equal(catalog.get("D7140.1"), "Simple w/o dentures");
  });
});

describe("mergeProcedureCodeCatalogs", () => {
  it("prefers the longer description when merging", () => {
    const merged = mergeProcedureCodeCatalogs(
      new Map([["D7140", "Extraction"]]),
      new Map([["D7140", "Extraction, erupted tooth or exposed root"]]),
    );
    assert.equal(
      merged.get("D7140"),
      "Extraction, erupted tooth or exposed root",
    );
  });
});
