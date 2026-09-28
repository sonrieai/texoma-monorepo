import "server-only";
import type { CdtCodeRow } from "@/lib/cdt/categories";
import { isOpenDentalMysqlConfigured } from "@/lib/opendental/config";
import { loadOpenDentalSnapshot } from "@/lib/opendental/snapshot";

const MYSQL_NOT_CONFIGURED =
  "Open Dental MySQL is not configured. Set OD_MYSQL_HOST, OD_MYSQL_USER, OD_MYSQL_DB, and OD_MYSQL_PASS.";

export type ProcedureCodeListResult = {
  codes: CdtCodeRow[];
  categories: readonly string[];
  feeScheduleNames: [string | null, string | null, string | null];
};

export async function listProcedureCodes(): Promise<ProcedureCodeListResult> {
  if (!isOpenDentalMysqlConfigured()) {
    throw new Error(MYSQL_NOT_CONFIGURED);
  }
  const snapshot = await loadOpenDentalSnapshot();
  const visibleCategories = snapshot.procedureCategories.filter(
    (row) => !row.hidden,
  );
  const categories =
    visibleCategories.length > 0
      ? visibleCategories.map((row) => row.name)
      : [...new Set(snapshot.cdtRows.map((doc) => doc.category).filter(Boolean))].sort(
          (a, b) => a.localeCompare(b),
        );
  return {
    codes: [...snapshot.cdtRows].sort((a, b) => a.code.localeCompare(b.code)),
    categories,
    feeScheduleNames: [null, null, null],
  };
}
