import { NextResponse } from "next/server";
import { getWarehouseMeta } from "@/lib/mongo/warehouse-overview";
import {
  authorizeNexHealthSyncRequest,
  isNexHealthSyncEnabled,
  NEXHEALTH_SYNC_CRON_SCHEDULE,
} from "@/lib/sync/nexhealth-sync-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync/nexhealth/status
 * Requires x-sync-secret, ?secret=, or Authorization: Bearer (SYNC_SECRET / CRON_SECRET).
 * Does not run a sync — returns last warehouse sync metadata only.
 */
export async function GET(request: Request) {
  const auth = authorizeNexHealthSyncRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const meta = await getWarehouseMeta();

  return NextResponse.json({
    ok: true,
    enabled: isNexHealthSyncEnabled(),
    cronScheduleUtc: NEXHEALTH_SYNC_CRON_SCHEDULE,
    lastSyncedAt: meta?.lastSyncedAt ?? null,
    lastSyncError: meta?.lastSyncError ?? null,
    locationId: meta?.locationId ?? null,
    locationName: meta?.locationName ?? null,
    lastNexhealthRequestCount: meta?.lastNexhealthRequestCount ?? null,
  });
}
