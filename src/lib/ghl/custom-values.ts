/**
 * Location custom values (e.g. od_sync_last_success heartbeat for workflows).
 *
 * Sync never creates custom values — that belongs in ensure-ghl-od-fields.ts.
 * GHL_OD_SYNC_LAST_SUCCESS_VALUE_ID is required for heartbeat PUTs.
 */

import { ghlFetch } from "@/lib/ghl/http";
import type { GhlConfig } from "@/lib/ghl/types";

export const OD_SYNC_LAST_SUCCESS_NAME = "od_sync_last_success";

export class OdSyncHeartbeatConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OdSyncHeartbeatConfigError";
  }
}

/** Process-lifetime cache of the env id (avoids re-reading each patient). */
let resolvedValueId: string | null = null;

export function clearOdSyncLastSuccessIdCache(): void {
  resolvedValueId = null;
}

/**
 * Resolve the custom value id from env only.
 * Never POSTs a new GHL custom value (would spam ~288/day on a 5-minute schedule).
 */
export function resolveOdSyncLastSuccessValueId(): string {
  const fromEnv = process.env.GHL_OD_SYNC_LAST_SUCCESS_VALUE_ID?.trim();
  if (fromEnv) {
    resolvedValueId = fromEnv;
    return fromEnv;
  }
  if (resolvedValueId) return resolvedValueId;
  throw new OdSyncHeartbeatConfigError(
    "GHL_OD_SYNC_LAST_SUCCESS_VALUE_ID is required for od_sync_last_success heartbeat. Run scripts/ensure-ghl-od-fields.ts and set the id — sync will not create custom values.",
  );
}

/**
 * Upsert heartbeat timestamp via PUT only.
 * Requires GHL_OD_SYNC_LAST_SUCCESS_VALUE_ID.
 */
export async function upsertOdSyncLastSuccess(
  isoTimestamp: string,
  config: GhlConfig,
): Promise<void> {
  const valueId = resolveOdSyncLastSuccessValueId();
  const body = { name: OD_SYNC_LAST_SUCCESS_NAME, value: isoTimestamp };
  await ghlFetch(
    `/locations/${encodeURIComponent(config.locationId)}/customValues/${encodeURIComponent(valueId)}`,
    { method: "PUT", body: JSON.stringify(body) },
    config,
  );
}
