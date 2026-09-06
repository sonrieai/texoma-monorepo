export type PeriodMode = "daily" | "monthly" | "range";

export type PeriodState = {
  mode: PeriodMode;
  day: string;
  month: string;
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

export function lastDayOfMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${yyyyMm}-${String(last).padStart(2, "0")}`;
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
  const thisYear = rangePreset("thisYear", now);
  return {
    mode: "range",
    day,
    month,
    from: thisYear.from,
    to: thisYear.to,
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
  const mode: PeriodMode =
    modeRaw === "daily" || modeRaw === "monthly" || modeRaw === "range"
      ? modeRaw
      : defaults.mode;
  const dayRaw = readParam(raw, "day");
  const monthRaw = readParam(raw, "month");
  const fromRaw = readParam(raw, "from");
  const toRaw = readParam(raw, "to");
  const day = dayRaw && YMD.test(dayRaw) ? dayRaw : defaults.day;
  const month = monthRaw && YM.test(monthRaw) ? monthRaw : defaults.month;
  let from = fromRaw && YMD.test(fromRaw) ? fromRaw : defaults.from;
  let to = toRaw && YMD.test(toRaw) ? toRaw : defaults.to;
  if (from > to) to = from;
  return { mode, day, month, from, to };
}

export function periodToRange(state: PeriodState): PeriodRange {
  if (state.mode === "daily") return { start: state.day, end: state.day };
  if (state.mode === "monthly") {
    return { start: `${state.month}-01`, end: lastDayOfMonth(state.month) };
  }
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
  const [fy, fm, fd] = state.from.split("-").map(Number);
  const [ty, tm, td] = state.to.split("-").map(Number);
  if (fy === ty) {
    return `${MONTH_ABBR[fm - 1]} ${fd} – ${MONTH_ABBR[tm - 1]} ${td}, ${ty}`;
  }
  return `${MONTH_ABBR[fm - 1]} ${fd}, ${fy} – ${MONTH_ABBR[tm - 1]} ${td}, ${ty}`;
}

export function treatmentChartSubtitle(state: PeriodState): string {
  if (state.mode === "monthly") {
    return "Last 6 months · hover a segment for detail";
  }
  return `${periodLabel(state)} · hover a segment for detail`;
}

export const MONTH_LABELS = MONTH_ABBR;
