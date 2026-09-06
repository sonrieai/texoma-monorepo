import { NextResponse } from "next/server";
import { runNexHealthWarehouseSync } from "@/lib/mongo/sync";
import {
  authorizeNexHealthSyncRequest,
  isNexHealthSyncEnabled,
} from "@/lib/sync/nexhealth-sync-auth";

export async function handleNexHealthSyncRequest(request: Request): Promise<Response> {
  const auth = authorizeNexHealthSyncRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  if (!isNexHealthSyncEnabled()) {
    return NextResponse.json(
      { ok: false, error: "SYNC_NEXHEALTH_ENABLED=false" },
      { status: 403 },
    );
  }

  try {
    const trigger = request.headers.get("x-vercel-cron") ? "cron" : "http";
    const result = await runNexHealthWarehouseSync({
      trigger,
      triggeredBy: trigger === "cron" ? "vercel-cron" : `http:${auth.via}`,
    });
    return NextResponse.json(
      { ...result, triggeredVia: auth.via },
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
