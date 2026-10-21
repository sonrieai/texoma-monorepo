import "server-only";

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_STAGE_TIER_BY_ID,
  resolveLeadsPipelineId,
} from "@/lib/ghl/funnel-stage-tiers";
import {
  furthestTier,
  resolveTcPipelineId,
  type FunnelTier,
} from "@/lib/ghl/tc-stage-tiers";

export type FunnelSettingsDoc = {
  /** Stage id → tier overrides (merged over defaults). */
  stageTiers: Record<string, FunnelTier>;
  /** Furthest funnel tier observed per opportunity id. */
  maxTierByOpportunity: Record<string, FunnelTier>;
  updatedAt?: string;
};

function emptyDoc(): FunnelSettingsDoc {
  return { stageTiers: {}, maxTierByOpportunity: {} };
}

function settingsPath(): string {
  const override = process.env.GHL_FUNNEL_SETTINGS_PATH?.trim();
  if (override) return override;
  return path.join(process.cwd(), "data", "ghl-funnel-settings.json");
}

function normalize(raw: unknown): FunnelSettingsDoc {
  const parsed =
    raw && typeof raw === "object" ? (raw as Partial<FunnelSettingsDoc>) : {};
  return {
    stageTiers:
      parsed.stageTiers && typeof parsed.stageTiers === "object"
        ? (parsed.stageTiers as Record<string, FunnelTier>)
        : {},
    maxTierByOpportunity:
      parsed.maxTierByOpportunity &&
      typeof parsed.maxTierByOpportunity === "object"
        ? (parsed.maxTierByOpportunity as Record<string, FunnelTier>)
        : {},
    updatedAt:
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
  };
}

export async function readFunnelSettings(): Promise<FunnelSettingsDoc> {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    return normalize(JSON.parse(raw) as unknown);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyDoc();
    throw err;
  }
}

export async function writeFunnelSettings(doc: FunnelSettingsDoc): Promise<void> {
  const filePath = settingsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const body = {
    ...doc,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(filePath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

export async function mergedStageTierMap(): Promise<
  Record<string, FunnelTier>
> {
  const doc = await readFunnelSettings();
  return { ...DEFAULT_STAGE_TIER_BY_ID, ...doc.stageTiers };
}

export function defaultPipelineIds(): string[] {
  return [resolveLeadsPipelineId(), resolveTcPipelineId()];
}

/** Effective tier for counts: furthest stage reached for this opportunity. */
export function effectiveOpportunityTier(
  doc: FunnelSettingsDoc,
  opportunityId: string,
  currentTier: FunnelTier,
): FunnelTier {
  if (currentTier === "unmapped") return "unmapped";
  const prev = doc.maxTierByOpportunity[opportunityId];
  return prev ? furthestTier(prev, currentTier) : currentTier;
}

export async function persistFurthestTiers(
  doc: FunnelSettingsDoc,
  dirty: boolean,
): Promise<void> {
  if (!dirty) return;
  await writeFunnelSettings(doc);
}

export function tierFromMap(
  map: Record<string, FunnelTier>,
  stageId: string | null | undefined,
): FunnelTier {
  const id = (stageId ?? "").trim();
  if (!id) return "unmapped";
  return map[id] ?? "unmapped";
}
