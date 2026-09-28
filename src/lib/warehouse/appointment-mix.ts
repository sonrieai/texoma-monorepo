/** PHI-safe appointment type aggregates (counts only — no patient fields). */

export type AppointmentTypeMixRow = {
  id: string;
  name: string;
  count: number;
  show: number;
  noShow: number;
  cancelled: number;
  unknown: number;
};

export function emptyTypeMixRow(
  id: string,
  name: string,
): AppointmentTypeMixRow {
  return {
    id,
    name,
    count: 0,
    show: 0,
    noShow: 0,
    cancelled: 0,
    unknown: 0,
  };
}

export function bumpTypeMix(
  row: AppointmentTypeMixRow,
  status: "show" | "no_show" | "cancelled" | "unknown",
): void {
  row.count++;
  if (status === "show") row.show++;
  else if (status === "no_show") row.noShow++;
  else if (status === "cancelled") row.cancelled++;
  else row.unknown++;
}

export function sortTypeMix(
  rows: AppointmentTypeMixRow[],
): AppointmentTypeMixRow[] {
  return [...rows].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
