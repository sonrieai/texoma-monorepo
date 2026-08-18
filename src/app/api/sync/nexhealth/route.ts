import { NextResponse } from "next/server";
import { runNexHealthWarehouseSync } from "@/lib/mongo/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/sync/nexhealth
 * Header: x-sync-secret: $SYNC_SECRET
 * Triggers NexHealth → Mongo warehouse sync (for Netlify cron / manual).
 */
export async function POST(request: Request) {
  const expected = process.env.SYNC_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "SYNC_SECRET is not configured" },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get("x-sync-secret")?.trim() ||
    new URL(request.url).searchParams.get("secret")?.trim() ||
    "";

  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.SYNC_NEXHEALTH_ENABLED?.trim()?.toLowerCase() === "false") {
    return NextResponse.json(
      { ok: false, error: "SYNC_NEXHEALTH_ENABLED=false" },
      { status: 403 },
    );
  }

  try {
    const result = await runNexHealthWarehouseSync();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 207,
    });
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
