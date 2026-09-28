import { NextResponse } from "next/server";
import { isOpenDentalMysqlConfigured } from "@/lib/opendental/config";
import { probeOpenDentalMysql } from "@/lib/opendental/probe";

export const dynamic = "force-dynamic";

/** GET /api/health/opendental-mysql — PHI-safe connectivity probe. */
export async function GET() {
  if (!isOpenDentalMysqlConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error:
          "Open Dental MySQL is not configured (OD_MYSQL_HOST / USER / DB / PASS)",
      },
      { status: 503 },
    );
  }

  const result = await probeOpenDentalMysql();
  return NextResponse.json(
    {
      ok: result.ok,
      configured: result.configured,
      connected: result.connected,
      serverVersion: result.serverVersion,
      database: result.database,
      grantsReadonly: result.grantsReadonly,
      missingTables: result.missingTables,
      tableCounts: result.tables.map((t) => ({
        table: t.table,
        present: t.present,
        rowCount: t.rowCount,
      })),
      errors: result.errors,
      // Never return grant lines with possible host specifics beyond redacted summary length
      grantLineCount: result.grantSummary.length,
    },
    { status: result.ok ? 200 : 503 },
  );
}
