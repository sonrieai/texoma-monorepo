import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth/require-dashboard-session";
import { isMongoConfigured } from "@/lib/mongo/client";
import { runNexHealthWarehouseSync } from "@/lib/mongo/sync";
import { listSyncHistory, SYNC_HISTORY_PAGE_SIZE } from "@/lib/mongo/sync-history";
import { getWarehouseMeta } from "@/lib/mongo/warehouse-overview";
import {
  isNexHealthSyncEnabled,
  NEXHEALTH_SYNC_CRON_SCHEDULE,
} from "@/lib/sync/nexhealth-sync-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

async function syncStatusPayload(request: Request) {
  const meta = await getWarehouseMeta();
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("pageSize")) || SYNC_HISTORY_PAGE_SIZE),
  );
  const history = await listSyncHistory({ page, pageSize });

  return {
    ok: true,
    enabled: isNexHealthSyncEnabled(),
    mongoConfigured: isMongoConfigured(),
    cronScheduleUtc: NEXHEALTH_SYNC_CRON_SCHEDULE,
    lastSyncedAt: meta?.lastSyncedAt ?? null,
    lastSyncError: meta?.lastSyncError ?? null,
    locationName: meta?.locationName ?? null,
    lastNexhealthRequestCount: meta?.lastNexhealthRequestCount ?? null,
    history,
  };
}

/** GET /api/settings/sync — warehouse sync status + history (logged-in admins). */
export async function GET(request: Request) {
  const session = await requireDashboardSession();
  if (!session) return unauthorized();
  return NextResponse.json(await syncStatusPayload(request));
}

/** POST /api/settings/sync — manual NexHealth → Mongo sync (logged-in admins). */
export async function POST() {
  const session = await requireDashboardSession();
  if (!session) return unauthorized();

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "MONGODB_URI is not configured" },
      { status: 503 },
    );
  }

  if (!isNexHealthSyncEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Sync is disabled (SYNC_NEXHEALTH_ENABLED=false)" },
      { status: 403 },
    );
  }

  try {
    const result = await runNexHealthWarehouseSync({
      trigger: "manual",
      triggeredBy: session.email,
    });
    return NextResponse.json(
      {
        ...result,
        triggeredBy: session.email,
      },
      { status: result.ok ? 200 : 207 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Sync failed",
      },
      { status: 500 },
    );
  }
}
