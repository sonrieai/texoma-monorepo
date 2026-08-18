import { CHANNEL_COLORS } from "@/lib/types/viz";

export type ChartCategoryDef = {
  /** Stable key — Open Dental category name from NexHealth sync. */
  key: string;
  label: string;
  color: string;
};

export const UNCATEGORIZED_CHART_CATEGORY = "Uncategorized";

/** Assign chart colors to dynamic Open Dental category names (stable order). */
export function buildChartCategories(
  categoryNames: readonly string[],
): ChartCategoryDef[] {
  const unique = [...new Set(categoryNames.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  return unique.map((name, index) => ({
    key: name,
    label: name,
    color: CHANNEL_COLORS[index % CHANNEL_COLORS.length]!,
  }));
}

export function emptyCategoryValues(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

/** Roll production dollars into visible category keys; unknown → Uncategorized when listed. */
export function rollToVisibleCategories(
  categories: Record<string, number>,
  visibleKeys: readonly string[],
  uncategorizedKey = UNCATEGORIZED_CHART_CATEGORY,
): Record<string, number> {
  const visible = new Set(visibleKeys);
  const values = emptyCategoryValues(visibleKeys);
  for (const [category, amount] of Object.entries(categories)) {
    if (visible.has(category)) {
      values[category] = (values[category] ?? 0) + amount;
    } else if (visible.has(uncategorizedKey)) {
      values[uncategorizedKey] = (values[uncategorizedKey] ?? 0) + amount;
    }
  }
  return values;
}

export function visibleCategoryNames(
  categories: readonly { name: string; hidden?: boolean }[],
): string[] {
  return categories.filter((c) => !c.hidden).map((c) => c.name);
}
