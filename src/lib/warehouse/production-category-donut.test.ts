import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProductionCategoryDonutSlices,
  buildProviderProductionCategoryDonutSlices,
  productionCategoryDonutTotalCents,
  providerProductionCategoryDonutTotalCents,
} from "./production-category-donut";
import { COCKPIT_DISPLAY_CATEGORY_NAMES } from "@/lib/charts/cockpit-display-categories";

function sliceValues(
  slices: ReturnType<typeof buildProductionCategoryDonutSlices>,
) {
  return Object.fromEntries(slices.map((s) => [s.label, s.value]));
}

describe("buildProductionCategoryDonutSlices", () => {
  it("returns six primary OD categories plus Other", () => {
    const slices = buildProductionCategoryDonutSlices({
      procedureCategories: [],
      productionByCategory: [
        { category: "Extractions", productionCents: 50_000, count: 2 },
        { category: "Implants", productionCents: 100_000, count: 1 },
        { category: "Fixed (All-on-4)", productionCents: 20_000, count: 1 },
      ],
      unmappedCodes: [],
      netProductionCents: 170_000,
    });

    assert.deepEqual(
      slices.map((s) => s.label),
      [...COCKPIT_DISPLAY_CATEGORY_NAMES],
    );
    assert.deepEqual(sliceValues(slices), {
      Dentures: 0,
      Extractions: 500,
      Hygiene: 0,
      Implants: 1000,
      "Partial Dentures": 0,
      "Restorative Dentistry": 0,
      Other: 200,
    });
  });

  it("rolls unmapped codes into Other", () => {
    const slices = buildProductionCategoryDonutSlices({
      procedureCategories: [],
      productionByCategory: [],
      unmappedCodes: [
        {
          code: "T1356",
          name: "Exam",
          count: 3,
          productionCents: 18_000,
        },
      ],
      netProductionCents: 18_000,
    });

    assert.equal(sliceValues(slices).Other, 180);
  });

  it("uses net production for center total when categories empty", () => {
    const total = productionCategoryDonutTotalCents({
      procedureCategories: [],
      productionByCategory: [],
      unmappedCodes: [],
      netProductionCents: 194_300,
    });
    assert.equal(total, 194_300);
  });
});

describe("buildProviderProductionCategoryDonutSlices", () => {
  it("maps provider production into cockpit categories", () => {
    const slices = buildProviderProductionCategoryDonutSlices({
      productionByCategory: [
        { category: "Extractions", productionCents: 15_000, count: 1 },
      ],
      grossProductionCents: 15_000,
      netProductionCents: 15_000,
    });

    assert.equal(sliceValues(slices).Extractions, 150);
    assert.equal(
      providerProductionCategoryDonutTotalCents({
        productionByCategory: [
          { category: "Extractions", productionCents: 15_000, count: 1 },
        ],
        grossProductionCents: 15_000,
        netProductionCents: 15_000,
      }),
      15_000,
    );
  });
});
