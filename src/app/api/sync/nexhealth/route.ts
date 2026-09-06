import { handleNexHealthSyncRequest } from "@/lib/sync/run-nexhealth-sync-http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * NexHealth → Mongo warehouse sync (manual, Vercel Cron, or Task Scheduler).
 *
 * POST or GET /api/sync/nexhealth
 * Auth: x-sync-secret, ?secret=, or Authorization: Bearer ($SYNC_SECRET or $CRON_SECRET)
 *
 * Vercel Cron sends GET with Bearer CRON_SECRET when CRON_SECRET is set in project env.
 */
export async function POST(request: Request) {
  return handleNexHealthSyncRequest(request);
}

export async function GET(request: Request) {
  return handleNexHealthSyncRequest(request);
}
