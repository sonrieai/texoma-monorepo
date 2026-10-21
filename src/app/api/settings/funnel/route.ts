import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-dashboard-session";
import {
  defaultPipelineIds,
  mergedStageTierMap,
  readFunnelSettings,
  writeFunnelSettings,
  type FunnelSettingsDoc,
} from "@/lib/ghl/funnel-settings-store";
import type { FunnelTier } from "@/lib/ghl/tc-stage-tiers";

const VALID_TIERS = new Set<FunnelTier>([
  "lead",
  "booked",
  "showed",
  "accepted",
  "surgery",
  "unmapped",
]);

export async function GET() {
  const staff = await requireStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const doc = await readFunnelSettings();
  const merged = await mergedStageTierMap();
  return NextResponse.json({
    pipelineIds: defaultPipelineIds(),
    stageTiers: doc.stageTiers,
    mergedStageCount: Object.keys(merged).length,
    unmappedTracked: Object.values(merged).filter((t) => t === "unmapped").length,
    maxTierByOpportunityCount: Object.keys(doc.maxTierByOpportunity).length,
    updatedAt: doc.updatedAt ?? null,
  });
}

export async function POST(request: Request) {
  const staff = await requireStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as Partial<FunnelSettingsDoc>;
  const stageTiers: Record<string, FunnelTier> = {};
  if (body.stageTiers && typeof body.stageTiers === "object") {
    for (const [id, tier] of Object.entries(body.stageTiers)) {
      if (!id.trim() || !VALID_TIERS.has(tier as FunnelTier)) continue;
      stageTiers[id.trim()] = tier as FunnelTier;
    }
  }
  await writeFunnelSettings({
    stageTiers,
    maxTierByOpportunity: {},
  });
  return GET();
}
