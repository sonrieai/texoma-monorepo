import { NextResponse } from "next/server";
import { listProcedureCodes } from "@/lib/cdt/procedure-codes-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await listProcedureCodes();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Failed to load procedure codes",
        codes: [],
        categories: [],
        feeScheduleNames: [null, null, null],
      },
      { status: 503 },
    );
  }
}
