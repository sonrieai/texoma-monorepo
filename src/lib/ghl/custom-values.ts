/**
 * Location custom values (e.g. od_sync_last_success heartbeat for workflows).
 */

import { ghlFetch } from "@/lib/ghl/http";
import type { GhlConfig } from "@/lib/ghl/types";

const OD_SYNC_LAST_SUCCESS_NAME = "od_sync_last_success";

export async function upsertOdSyncLastSuccess(
  isoTimestamp: string,
  config: GhlConfig,
): Promise<void> {
  const valueId = process.env.GHL_OD_SYNC_LAST_SUCCESS_VALUE_ID?.trim();
  const body = { name: OD_SYNC_LAST_SUCCESS_NAME, value: isoTimestamp };
  if (valueId) {
    await ghlFetch(
      `/locations/${encodeURIComponent(config.locationId)}/customValues/${encodeURIComponent(valueId)}`,
      { method: "PUT", body: JSON.stringify(body) },
      config,
    );
    return;
  }
  // Create when id not configured (ensure script should set env afterward).
  await ghlFetch(
    `/locations/${encodeURIComponent(config.locationId)}/customValues`,
    { method: "POST", body: JSON.stringify(body) },
    config,
  );
}
