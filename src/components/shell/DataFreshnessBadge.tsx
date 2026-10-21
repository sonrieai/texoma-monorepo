import { readOdGhlSyncState } from "@/lib/ghl/od-ghl-sync-state";
import { loadOpenDentalSnapshotMeta } from "@/lib/opendental/snapshot";

export async function DataFreshnessBadge() {
  let odLoaded: string | null = null;
  let ghlSync: string | null = null;
  try {
    const meta = await loadOpenDentalSnapshotMeta();
    odLoaded = meta.loadedAt;
  } catch {
    odLoaded = null;
  }
  try {
    const state = await readOdGhlSyncState();
    ghlSync = state.lastSuccessfulRunAt ?? null;
  } catch {
    ghlSync = null;
  }

  const parts: string[] = [];
  if (odLoaded) {
    parts.push(`OD read ${odLoaded.slice(0, 19).replace("T", " ")} UTC`);
  }
  if (ghlSync) {
    parts.push(`GHL sync ${ghlSync.slice(0, 19).replace("T", " ")} UTC`);
  }
  if (parts.length === 0) return null;

  return (
    <span className="text-xs text-muted font-normal" title="Data freshness">
      {parts.join(" · ")}
    </span>
  );
}
