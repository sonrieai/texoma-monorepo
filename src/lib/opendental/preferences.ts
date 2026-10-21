import "server-only";

import { queryOpenDental } from "@/lib/opendental/mysql";
import type { RowDataPacket } from "mysql2";

/** Open Dental preference value by PrefName (SELECT only). */
export async function readOdPreference(
  prefName: string,
): Promise<string | null> {
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT ValueString FROM preference WHERE PrefName = ? LIMIT 1`,
    [prefName],
  );
  const v = rows[0]?.ValueString;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function readOdAgingMetadata(): Promise<{
  dateLastAging: string | null;
  serviceTimeDue: string | null;
}> {
  const [dateLastAging, serviceTimeDue] = await Promise.all([
    readOdPreference("DateLastAging"),
    readOdPreference("AgingServiceTimeDue"),
  ]);
  return { dateLastAging, serviceTimeDue };
}
