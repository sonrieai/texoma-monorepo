import { NextResponse } from "next/server";
import { loadLiveProviders } from "@/lib/warehouse/live";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const providers = await loadLiveProviders();
    return NextResponse.json(
      { providers },
      {
        headers: {
          // Let the browser/sidebar reuse this briefly while switching doctors
          "Cache-Control": "private, max-age=60",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed", providers: [] },
      { status: 503 },
    );
  }
}
