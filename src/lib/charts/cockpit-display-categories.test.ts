import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeToCockpitDisplayCategory,
  providerCockpitCategoryCounts,
  rollToCockpitDisplayCategories,
} from "./cockpit-display-categories";
import { emptyProcedureVolume } from "../warehouse/production";

describe("normalizeToCockpitDisplayCategory", () => {
  it("keeps primary OD names", () => {
    assert.equal(normalizeToCockpitDisplayCategory("Extractions"), "Extractions");
    assert.equal(
      normalizeToCockpitDisplayCategory("Restorative Dentistry"),
      "Restorative Dentistry",
    );
  });

  it("maps aliases and unknown categories to Other", () => {
    assert.equal(normalizeToCockpitDisplayCategory("Restorative"), "Restorative Dentistry");
    assert.equal(normalizeToCockpitDisplayCategory("Fixed (All-on-4)"), "Other");
    assert.equal(normalizeToCockpitDisplayCategory("Category 377"), "Other");
  });
});

describe("providerCockpitCategoryCounts", () => {
  it("combines volume buckets with hygiene and restorative counts", () => {
    const vol = emptyProcedureVolume();
    vol.implants = 2;
    vol.extractions = 3;
    vol.dentures = 1;
    vol.partials = 4;

    assert.deepEqual(
      providerCockpitCategoryCounts(
        [
          { category: "Hygiene", productionCents: 5000, count: 5 },
          { category: "Restorative", productionCents: 8000, count: 2 },
        ],
        vol,
      ),
      {
        Dentures: 1,
        Extractions: 3,
        Hygiene: 5,
        Implants: 2,
        "Partial Dentures": 4,
        "Restorative Dentistry": 2,
        Other: 0,
      },
    );
  });

  it("counts non-primary categories as Other", () => {
    const vol = emptyProcedureVolume();
    assert.deepEqual(
      providerCockpitCategoryCounts(
        [
          { category: "Fixed (All-on-4)", productionCents: 20_000, count: 1 },
          { category: "Category 377", productionCents: 5_000, count: 2 },
        ],
        vol,
      ).Other,
      3,
    );
  });
});

describe("rollToCockpitDisplayCategories", () => {
  it("aggregates non-primary production into Other", () => {
    assert.deepEqual(
      rollToCockpitDisplayCategories({
        Extractions: 150,
        Hygiene: 60,
        "Other Surgery": 40,
        Uncategorized: 10,
      }),
      {
        Dentures: 0,
        Extractions: 150,
        Hygiene: 60,
        Implants: 0,
        "Partial Dentures": 0,
        "Restorative Dentistry": 0,
        Other: 50,
      },
    );
  });
});
