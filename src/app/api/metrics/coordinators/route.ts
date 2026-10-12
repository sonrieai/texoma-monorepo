import { NextResponse } from "next/server";
import { apiAccessError } from "@/lib/auth/require-dashboard-session";
import { loadTcCoordinatorLinks } from "@/lib/tc/load-coordinator-roster";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await apiAccessError("/api/metrics/coordinators");
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }
  const coordinators = await loadTcCoordinatorLinks();
  return NextResponse.json(
    { coordinators },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    },
  );
}
