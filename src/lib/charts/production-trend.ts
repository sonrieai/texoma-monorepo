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
