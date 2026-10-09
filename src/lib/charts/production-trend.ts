import { CHANNEL_COLORS } from "@/lib/types/viz";

export const TREND_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Hide months after today for the current calendar year (mockup stops at current month). */
export function clipCurrentYearMonths(
  year: number,
  months: number[],
  now = new Date(),
): (number | null)[] {
  if (year !== now.getFullYear()) return months;
  const cutoff = now.getMonth();
  return months.map((v, i) => (i > cutoff ? null : v));
}

export type YearMonthSeries = {
  year: number;
  months: number[];
};

export type ProductionYearLines = {
  xLabels: string[];
  series: { label: string; values: (number | null)[]; color: string }[];
  subtitle: string;
};

function monthDollars(monthly: YearMonthSeries[], year: number, monthIndex: number): number {
  return monthly.find((row) => row.year === year)?.months[monthIndex] ?? 0;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Last calendar month that has finished. A month still in progress is left off the line. */
export function lastCompleteMonth(now = new Date()): { year: number; monthIndex: number } {
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  if (now.getDate() >= lastDayOfMonth(year, monthIndex)) {
    return { year, monthIndex };
  }
  if (monthIndex === 0) return { year: year - 1, monthIndex: 11 };
  return { year, monthIndex: monthIndex - 1 };
}

const YEAR_LINE_COLORS = [CHANNEL_COLORS[3], CHANNEL_COLORS[2], CHANNEL_COLORS[0]];

function yearLineColor(index: number, count: number): string {
  if (count <= YEAR_LINE_COLORS.length) {
    return YEAR_LINE_COLORS[YEAR_LINE_COLORS.length - count + index] ?? CHANNEL_COLORS[0];
  }
  return CHANNEL_COLORS[index % CHANNEL_COLORS.length];
}

/**
 * One line per year on a shared Jan–Dec axis, so years can be compared
 * in parallel. The current year stops at the last complete month.
 */
export function productionGrowthLines(
  monthly: YearMonthSeries[],
  now = new Date(),
): ProductionYearLines {
  const end = lastCompleteMonth(now);
  const years = [...new Set(monthly.map((row) => row.year))]
    .filter((year) => year <= end.year)
    .sort((a, b) => a - b);

  const series = years.map((year) => {
    const values = TREND_MONTH_LABELS.map((_, month) => {
      if (year === end.year && month > end.monthIndex) return null;
      return monthDollars(monthly, year, month);
    });
    return { year, values };
  }).filter((row) => row.values.some((value) => value != null));

  const lines = series.map((row, index) => ({
    label: String(row.year),
    values: row.values,
    color: yearLineColor(index, series.length),
  }));

  const labels = lines.map((row) => row.label);
  const currentIsPartial =
    lines.some((row) => row.label === String(end.year)) && end.monthIndex < 11;
  const subtitle = labels.length === 0
    ? "—"
    : currentIsPartial
      ? `${labels.join(" · ")} through ${TREND_MONTH_LABELS[end.monthIndex]}`
      : labels.join(" · ");

  return {
    xLabels: [...TREND_MONTH_LABELS],
    series: lines,
    subtitle,
  };
}
