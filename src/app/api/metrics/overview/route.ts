import { NextResponse } from "next/server";
import { getOverviewMetrics } from "@/lib/metrics/overview";
import { rangeFromSearchParams } from "@/lib/ui/period";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics/overview
 */
export async function GET(request: Request) {
  const { start, end } = rangeFromSearchParams(new URL(request.url).searchParams);
  const data = await getOverviewMetrics(start, end);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
