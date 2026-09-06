"use client";

import { useCallback, useEffect, useState } from "react";
import { SyncHistoryTable } from "@/components/settings/SyncHistoryTable";
import { Card, ComboStat, SectionHeading } from "@/components/ui/Cards";
import { InlineSpinner } from "@/components/ui/States";
import type { SyncHistoryPage } from "@/lib/mongo/sync-history";

type SyncStatus = {
  ok: boolean;
  enabled: boolean;
  mongoConfigured: boolean;
  cronScheduleUtc: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  locationName: string | null;
  lastNexhealthRequestCount: number | null;
  history?: SyncHistoryPage;
};

type SyncResult = {
  ok: boolean;
  lastSyncedAt?: string;
  errors?: string[];
  error?: string;
};

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [history, setHistory] = useState<SyncHistoryPage | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  const refreshStatus = useCallback(async (page: number) => {
    setLoadError(null);
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/settings/sync?page=${page}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as SyncStatus & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setStatus(data);
      setHistory(data.history ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to load sync status");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus(historyPage);
  }, [historyPage, refreshStatus]);

  async function runSync() {
    setSyncing(true);
    setResultMessage(null);
    setResultError(null);
    try {
      const res = await fetch("/api/settings/sync", { method: "POST" });
      const data = (await res.json()) as SyncResult;
      if (!res.ok && res.status !== 207) {
        throw new Error(data.error ?? `Sync failed (HTTP ${res.status})`);
      }
      if (data.ok) {
        setResultMessage(
          `Sync completed at ${formatSyncedAt(data.lastSyncedAt ?? null)}.`,
        );
      } else {
        setResultError(
          data.errors?.join("; ") ?? "Sync finished with errors",
        );
      }
      setHistoryPage(1);
      await refreshStatus(1);
    } catch (e) {
      setResultError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const canSync =
    status?.enabled !== false && status?.mongoConfigured !== false && !syncing;

  return (
    <>
      <SectionHeading title="Warehouse sync" tag="NexHealth → MongoDB" />

      {loadError ? (
        <p className="mb-4 text-[12px] text-bad">{loadError}</p>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ComboStat
          label="Last synced"
          value={formatSyncedAt(status?.lastSyncedAt ?? null)}
          note={status?.locationName ?? "Practice warehouse"}
          status={status?.lastSyncedAt ? "good" : "warn"}
        />
        <ComboStat
          label="Auto sync (UTC)"
          value={status?.cronScheduleUtc ?? "—"}
          note="Vercel Cron when deployed"
        />
        <ComboStat
          label="Last API batches"
          value={
            status?.lastNexhealthRequestCount != null
              ? String(status.lastNexhealthRequestCount)
              : "—"
          }
          note="NexHealth requests in last run"
        />
      </div>

      <Card
        title="Manual sync"
        subtitle="Pull the latest appointments, production, and procedure codes from NexHealth into the dashboard warehouse. This may take a few minutes."
        className="mb-6"
      >
        {status?.enabled === false ? (
          <p className="mb-3 text-[12px] text-warn">
            Sync is disabled on this server (SYNC_NEXHEALTH_ENABLED=false).
          </p>
        ) : null}
        {status?.mongoConfigured === false ? (
          <p className="mb-3 text-[12px] text-bad">
            MongoDB is not configured. Set MONGODB_URI before syncing.
          </p>
        ) : null}
        {status?.lastSyncError ? (
          <p className="mb-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[12px] text-warn">
            Last run warning: {status.lastSyncError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSync}
            onClick={() => void runSync()}
            aria-busy={syncing}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent2 px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? (
              <>
                <InlineSpinner className="border-white/30 border-t-white" />
                Syncing…
              </>
            ) : (
              "Sync now"
            )}
          </button>
          <button
            type="button"
            disabled={syncing}
            onClick={() => void refreshStatus(historyPage)}
            className="inline-flex min-h-10 items-center rounded-lg border border-line bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:border-accent/40 disabled:opacity-60"
          >
            Refresh status
          </button>
        </div>

        {resultMessage ? (
          <p className="mt-3 text-[12px] text-good">{resultMessage}</p>
        ) : null}
        {resultError ? (
          <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[12px] text-bad">
            {resultError}
          </p>
        ) : null}
      </Card>

      <SyncHistoryTable
        history={history}
        loading={historyLoading}
        onPageChange={(page) => setHistoryPage(page)}
      />
    </>
  );
}
