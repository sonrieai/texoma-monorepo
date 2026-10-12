import { NextResponse } from "next/server";
import {
  apiAccessError,
  getDashboardAccess,
} from "@/lib/auth/require-dashboard-session";
import { loadLiveProviders } from "@/lib/warehouse/live";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const denied = await apiAccessError("/api/metrics/providers");
    if (denied) {
      return NextResponse.json(
        { error: denied.error, providers: [] },
        { status: denied.status },
      );
    }
    const access = await getDashboardAccess();
    let providers = await loadLiveProviders();
    if (access && access.role === "doctor") {
      providers = providers.filter((provider) => provider.id === access.providerId);
    }
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
