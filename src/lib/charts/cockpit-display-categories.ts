import { CHANNEL_COLORS } from "@/lib/types/viz";
import type { ChartCategoryDef } from "@/lib/charts/category-chart";
import { emptyCategoryValues } from "@/lib/charts/category-chart";
import type {
  CategoryProductionRow,
  ProcedureVolume,
} from "@/lib/warehouse/production";

/** Open Dental cockpit categories (Definitions — non-hidden). Everything else → Other. */
export const COCKPIT_PRIMARY_CATEGORY_NAMES = [
  "Dentures",
  "Extractions",
  "Hygiene",
  "Implants",
  "Partial Dentures",
  "Restorative Dentistry",
] as const;

export const COCKPIT_OTHER_CATEGORY = "Other";

export const COCKPIT_DISPLAY_CATEGORY_NAMES = [
  ...COCKPIT_PRIMARY_CATEGORY_NAMES,
  COCKPIT_OTHER_CATEGORY,
] as const;

const PRIMARY_SET = new Set<string>(COCKPIT_PRIMARY_CATEGORY_NAMES);

/** Map warehouse / OD labels into a cockpit primary bucket (or Other). */
const CATEGORY_ALIASES: Record<string, (typeof COCKPIT_PRIMARY_CATEGORY_NAMES)[number] | typeof COCKPIT_OTHER_CATEGORY> = {
  Restorative: "Restorative Dentistry",
  "Fixed (All-on-4)": "Other",
  "Other Surgery": "Other",
  Uncategorized: "Other",
};

export function normalizeToCockpitDisplayCategory(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return COCKPIT_OTHER_CATEGORY;
  if (PRIMARY_SET.has(trimmed)) return trimmed;
  const alias = CATEGORY_ALIASES[trimmed];
  if (alias) return alias;
  return COCKPIT_OTHER_CATEGORY;
}

/** Stable colors for cockpit donut + Treatment by Type (matches prototype order). */
export function buildCockpitDisplayChartCategories(): ChartCategoryDef[] {
  const colors = [
    CHANNEL_COLORS[2],
    CHANNEL_COLORS[6],
    CHANNEL_COLORS[5],
    CHANNEL_COLORS[0],
    CHANNEL_COLORS[3],
    CHANNEL_COLORS[1],
    CHANNEL_COLORS[4],
  ];
  return COCKPIT_DISPLAY_CATEGORY_NAMES.map((name, index) => ({
    key: name,
    label: name,
    color: colors[index] ?? CHANNEL_COLORS[index % CHANNEL_COLORS.length]!,
  }));
}

export function rollToCockpitDisplayCategories(
  categories: Record<string, number>,
): Record<string, number> {
  const values = emptyCategoryValues(COCKPIT_DISPLAY_CATEGORY_NAMES);
  for (const [category, amount] of Object.entries(categories)) {
    const bucket = normalizeToCockpitDisplayCategory(category);
    values[bucket] = (values[bucket] ?? 0) + amount;
  }
  return values;
}

export type CockpitPrimaryCategoryCounts = Record<
  (typeof COCKPIT_PRIMARY_CATEGORY_NAMES)[number],
  number
>;

export type CockpitProviderCategoryCounts = Record<
  (typeof COCKPIT_DISPLAY_CATEGORY_NAMES)[number],
  number
>;

export function emptyCockpitPrimaryCategoryCounts(): CockpitPrimaryCategoryCounts {
  return Object.fromEntries(
    COCKPIT_PRIMARY_CATEGORY_NAMES.map((name) => [name, 0]),
  ) as CockpitPrimaryCategoryCounts;
}

export function emptyCockpitProviderCategoryCounts(): CockpitProviderCategoryCounts {
  return Object.fromEntries(
    COCKPIT_DISPLAY_CATEGORY_NAMES.map((name) => [name, 0]),
  ) as CockpitProviderCategoryCounts;
}

/** Procedure counts per OD cockpit category (+ Other) for provider tables. */
export function providerCockpitCategoryCounts(
  productionByCategory: CategoryProductionRow[],
  procedureVolume: ProcedureVolume,
): CockpitProviderCategoryCounts {
  const counts = emptyCockpitProviderCategoryCounts();
  counts.Implants = procedureVolume.implants;
  counts.Extractions = procedureVolume.extractions;
  counts.Dentures = procedureVolume.dentures;
  counts["Partial Dentures"] = procedureVolume.partials;

  for (const row of productionByCategory) {
    const bucket = normalizeToCockpitDisplayCategory(row.category);
    if (bucket === COCKPIT_OTHER_CATEGORY) {
      counts.Other += row.count;
    } else if (bucket === "Hygiene" || bucket === "Restorative Dentistry") {
      counts[bucket] += row.count;
    }
  }

  return counts;
}
