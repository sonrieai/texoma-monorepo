export type PeriodMode = "daily" | "monthly" | "yearly" | "range";

export type PeriodState = {
  mode: PeriodMode;
  day: string;
  month: string;
  year: string;
  from: string;
  to: string;
};

export type PeriodRange = { start: string; end: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;
const MONTH_ABBR = [
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

export function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function currentMonthKey(now = new Date()): string {
  return todayYmd(now).slice(0, 7);
}

export function currentYearKey(now = new Date()): string {
  return String(now.getFullYear());
}

/** Selected calendar year. The current year stops at today. */
export function yearRange(
  year: string,
  now = new Date(),
): { start: string; end: string } {
  const start = `${year}-01-01`;
  const y = Number(year);
  if (y === now.getFullYear()) return { start, end: todayYmd(now) };
  if (y > now.getFullYear()) return { start, end: start };
  return { start, end: `${year}-12-31` };
}

export function lastDayOfMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${yyyyMm}-${String(last).padStart(2, "0")}`;
}

export const RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "last90", label: "Last 90 days" },
  { id: "last12", label: "Last 12 months" },
] as const;

export type RangePresetId = (typeof RANGE_PRESETS)[number]["id"];

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return todayYmd(date);
}

export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1 + months, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(d, last));
  return todayYmd(date);
}

export function isValidYmd(value: string): boolean {
  if (!YMD.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
  );
}

/** Inclusive ranges ending today. Last 12 months is the same calendar day one year ago. */
export function resolveRangePreset(
  id: RangePresetId,
  now = new Date(),
): { from: string; to: string } {
  const to = todayYmd(now);
  if (id === "today") return { from: to, to };
  if (id === "last7") return { from: addDaysYmd(to, -6), to };
  if (id === "last30") return { from: addDaysYmd(to, -29), to };
  if (id === "last90") return { from: addDaysYmd(to, -89), to };
  return { from: addMonthsYmd(to, -12), to };
}

export function matchRangePreset(
  from: string,
  to: string,
  now = new Date(),
): RangePresetId | "custom" {
  for (const preset of RANGE_PRESETS) {
    const range = resolveRangePreset(preset.id, now);
    if (range.from === from && range.to === to) return preset.id;
  }
  return "custom";
}

export function rangePreset(
  key: "thisYear" | "past3" | "past6" | "lastYear",
  now = new Date(),
): { from: string; to: string } {
  const to = todayYmd(now);
  const y = now.getFullYear();
  if (key === "thisYear") return { from: `${y}-01-01`, to };
  if (key === "lastYear") {
    return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
  const monthsBack = key === "past3" ? 3 : 6;
  const fromDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, now.getDate());
  return { from: todayYmd(fromDate), to };
}

export function defaultPeriodState(now = new Date()): PeriodState {
  const day = todayYmd(now);
  const month = currentMonthKey(now);
  const year = currentYearKey(now);
  const thisYear = yearRange(year, now);
  return {
    mode: "yearly",
    day,
    month,
    year,
    from: thisYear.start,
    to: thisYear.end,
  };
}

function readParam(
  raw: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  if (typeof (raw as URLSearchParams).get === "function") {
    return (raw as URLSearchParams).get(key);
  }
  const value = (raw as Record<string, string | string[] | undefined>)[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function parsePeriodParams(
  raw: URLSearchParams | Record<string, string | string[] | undefined>,
): PeriodState {
  const defaults = defaultPeriodState();
  const modeRaw = readParam(raw, "period");
  let mode: PeriodMode =
    modeRaw === "daily" ||
    modeRaw === "monthly" ||
    modeRaw === "yearly" ||
    modeRaw === "range"
      ? modeRaw
      : defaults.mode;
  const dayRaw = readParam(raw, "day");
  const monthRaw = readParam(raw, "month");
  const yearRaw = readParam(raw, "year");
  const fromRaw = readParam(raw, "from");
  const toRaw = readParam(raw, "to");
  const day = dayRaw && YMD.test(dayRaw) ? dayRaw : defaults.day;
  const month = monthRaw && YM.test(monthRaw) ? monthRaw : defaults.month;
  const year =
    yearRaw && /^\d{4}$/.test(yearRaw) ? yearRaw : defaults.year;
  let from = fromRaw && YMD.test(fromRaw) ? fromRaw : defaults.from;
  let to = toRaw && YMD.test(toRaw) ? toRaw : defaults.to;
  if (from > to) to = from;
  if (
    mode === "range" &&
    from.slice(0, 4) === to.slice(0, 4) &&
    from.endsWith("-01-01") &&
    (to.endsWith("-12-31") || to === defaults.day)
  ) {
    mode = "yearly";
    return { mode, day, month, year: from.slice(0, 4), from, to };
  }
  return { mode, day, month, year, from, to };
}

export function periodToRange(state: PeriodState, now = new Date()): PeriodRange {
  if (state.mode === "daily") return { start: state.day, end: state.day };
  if (state.mode === "monthly") {
    return { start: `${state.month}-01`, end: lastDayOfMonth(state.month) };
  }
  if (state.mode === "yearly") return yearRange(state.year, now);
  return { start: state.from, end: state.to };
}

export function rangeFromSearchParams(
  raw: URLSearchParams | Record<string, string | string[] | undefined>,
): PeriodRange {
  return periodToRange(parsePeriodParams(raw));
}

export function periodToSearchString(state: PeriodState): string {
  const params = new URLSearchParams();
  params.set("period", state.mode);
  if (state.mode === "daily") params.set("day", state.day);
  if (state.mode === "monthly") params.set("month", state.month);
  if (state.mode === "yearly") params.set("year", state.year);
  if (state.mode === "range") {
    params.set("from", state.from);
    params.set("to", state.to);
  }
  return params.toString();
}

export function periodLabel(state: PeriodState): string {
  if (state.mode === "daily") {
    const [y, m, d] = state.day.split("-").map(Number);
    return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
  }
  if (state.mode === "monthly") {
    const [y, m] = state.month.split("-").map(Number);
    return `${MONTH_ABBR[m - 1]} ${y}`;
  }
  if (state.mode === "yearly") {
    const span = yearRange(state.year);
    return formatRangeLabel(span.start, span.end);
  }
  return formatRangeLabel(state.from, state.to);
}

function formatRangeLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (from === to) return `${MONTH_ABBR[fm - 1]} ${fd}, ${fy}`;
  if (fy === ty) {
    return `${MONTH_ABBR[fm - 1]} ${fd} – ${MONTH_ABBR[tm - 1]} ${td}, ${ty}`;
  }
  return `${MONTH_ABBR[fm - 1]} ${fd}, ${fy} – ${MONTH_ABBR[tm - 1]} ${td}, ${ty}`;
}

export function treatmentChartSubtitle(state: PeriodState): string {
  return `${periodLabel(state)} · hover a segment for detail`;
}

export const MONTH_LABELS = MONTH_ABBR;
