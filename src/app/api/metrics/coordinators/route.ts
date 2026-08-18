import { NextResponse } from "next/server";
import { loadTcCoordinatorLinks } from "@/lib/tc/load-coordinator-roster";

export const dynamic = "force-dynamic";

export async function GET() {
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
