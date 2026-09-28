import { centsToDollars } from "@/lib/metrics";
import {
  buildCockpitDisplayChartCategories,
  COCKPIT_OTHER_CATEGORY,
  rollToCockpitDisplayCategories,
} from "@/lib/charts/cockpit-display-categories";
import type { ChartCategoryDef } from "@/lib/charts/category-chart";
import type { LiveProduction } from "@/lib/warehouse/live";
import type { CategoryProductionRow, ProcedureMixRow, ProviderProduction } from "@/lib/warehouse/production";

export type { ChartCategoryDef };

export function buildProductionChartCategories(
  _production?: Pick<
    LiveProduction,
    "procedureCategories" | "productionByCategory"
  >,
): ChartCategoryDef[] {
  return buildCockpitDisplayChartCategories();
}

function rollCategoryRows(rows: CategoryProductionRow[]): Record<string, number> {
  const categories: Record<string, number> = {};
  for (const row of rows) {
    categories[row.category] =
      (categories[row.category] ?? 0) + centsToDollars(row.productionCents);
  }
  return rollToCockpitDisplayCategories(categories);
}

function rollUnmapped(rows: ProcedureMixRow[]): number {
  let extra = 0;
  for (const row of rows) {
    if (row.productionCents <= 0) continue;
    extra += centsToDollars(row.productionCents);
  }
  return extra;
}

/** Cockpit donut: six OD categories + Other (zeros included for legend). */
export function buildProductionCategoryDonutSlices(
  production: Pick<
    LiveProduction,
    | "productionByCategory"
    | "unmappedCodes"
    | "netProductionCents"
    | "procedureCategories"
  >,
): { label: string; value: number; color: string }[] {
  const chartCategories = buildCockpitDisplayChartCategories();
  const values = rollCategoryRows(production.productionByCategory);
  values[COCKPIT_OTHER_CATEGORY] =
    (values[COCKPIT_OTHER_CATEGORY] ?? 0) + rollUnmapped(production.unmappedCodes);

  const categorizedTotal = Object.values(values).reduce((sum, v) => sum + v, 0);
  if (categorizedTotal <= 0 && production.netProductionCents > 0) {
    values[COCKPIT_OTHER_CATEGORY] =
      (values[COCKPIT_OTHER_CATEGORY] ?? 0) +
      centsToDollars(production.netProductionCents);
  }

  return chartCategories.map((category) => ({
    label: category.label,
    value: values[category.key] ?? 0,
    color: category.color,
  }));
}

export function productionCategoryDonutTotalCents(
  production: Pick<
    LiveProduction,
    | "productionByCategory"
    | "unmappedCodes"
    | "netProductionCents"
    | "procedureCategories"
  >,
): number {
  const slices = buildProductionCategoryDonutSlices(production);
  const fromSlices = slices.reduce((sum, s) => sum + s.value, 0);
  if (fromSlices > 0) return Math.round(fromSlices * 100);
  return production.netProductionCents;
}

export function buildProviderProductionCategoryDonutSlices(
  production: Pick<
    ProviderProduction,
    "productionByCategory" | "grossProductionCents" | "netProductionCents"
  >,
): { label: string; value: number; color: string }[] {
  return buildProductionCategoryDonutSlices({
    productionByCategory: production.productionByCategory,
    unmappedCodes: [],
    netProductionCents:
      production.netProductionCents > 0
        ? production.netProductionCents
        : production.grossProductionCents,
    procedureCategories: [],
  });
}

export function providerProductionCategoryDonutTotalCents(
  production: Pick<
    ProviderProduction,
    "productionByCategory" | "grossProductionCents" | "netProductionCents"
  >,
): number {
  const slices = buildProviderProductionCategoryDonutSlices(production);
  const fromSlices = slices.reduce((sum, s) => sum + s.value, 0);
  if (fromSlices > 0) return Math.round(fromSlices * 100);
  return production.netProductionCents > 0
    ? production.netProductionCents
    : production.grossProductionCents;
}

export function buildTreatmentChartCategories(
  _procedureCategories?: LiveProduction["procedureCategories"],
  _treatmentByMonth?: LiveProduction["treatmentByMonth"],
): ChartCategoryDef[] {
  return buildCockpitDisplayChartCategories();
}
