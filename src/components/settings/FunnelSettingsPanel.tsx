"use client";

import { useCallback, useEffect, useState } from "react";

type FunnelStatus = {
  pipelineIds: string[];
  stageTiers: Record<string, string>;
  mergedStageCount: number;
  updatedAt: string | null;
};

export function FunnelSettingsPanel() {
  const [status, setStatus] = useState<FunnelStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/settings/funnel");
    if (!res.ok) {
      setError("Could not load funnel settings");
      return;
    }
    setStatus((await res.json()) as FunnelStatus);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function resetOverrides() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageTiers: {} }),
      });
      if (!res.ok) throw new Error("Save failed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-card p-4 space-y-3">
      <p className="text-sm text-muted m-0">
        Funnel tiers are mapped by GoHighLevel stage id (defaults in code). Overrides
        persist in <code className="text-xs">data/ghl-funnel-settings.json</code>.
        Edit that file or reset here; unmapped stages are excluded from counts.
      </p>
      {error ? <p className="text-sm text-red-600 m-0">{error}</p> : null}
      {status ? (
        <ul className="text-sm m-0 pl-4 space-y-1">
          <li>Pipelines: {status.pipelineIds.join(", ")}</li>
          <li>Merged stage mappings: {status.mergedStageCount}</li>
          <li>Custom overrides: {Object.keys(status.stageTiers).length}</li>
          {status.updatedAt ? <li>Updated: {status.updatedAt}</li> : null}
        </ul>
      ) : (
        <p className="text-sm m-0">Loading…</p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void resetOverrides()}
        className="rounded-lg border border-line px-3 py-1.5 text-sm"
      >
        Reset overrides to defaults
      </button>
    </div>
  );
}
