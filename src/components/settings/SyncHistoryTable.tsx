"use client";

import { Card, SectionHeading, StatusDot } from "@/components/ui/Cards";
import { Pagination } from "@/components/ui/Pagination";
import type { SyncHistoryPage, SyncHistoryRow } from "@/lib/mongo/sync-history";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function triggerLabel(row: SyncHistoryRow): string {
  switch (row.trigger) {
    case "manual":
      return "Manual";
    case "cron":
      return "Scheduled";
    case "cli":
      return "CLI";
    case "http":
      return "API";
    default:
      return row.trigger;
  }
}

type Props = {
  history: SyncHistoryPage | null;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

export function SyncHistoryTable({ history, loading, onPageChange }: Props) {
  const items = history?.items ?? [];
  const total = history?.total ?? 0;
  const page = history?.page ?? 1;
  const pageSize = history?.pageSize ?? 10;
  const windowDays = history?.windowDays ?? 30;

  return (
    <>
      <SectionHeading
        title="Sync history"
        tag={`Last ${windowDays} days · ${total} run${total === 1 ? "" : "s"}`}
      />
      <Card className="overflow-hidden">
        {loading && items.length === 0 ? (
          <p className="text-[12px] text-muted">Loading history…</p>
        ) : total === 0 ? (
          <p className="text-[12px] text-muted">
            No sync runs recorded yet in the last {windowDays} days. Use Sync now
            or wait for the daily scheduled job.
          </p>
        ) : (
          <>
            <div className="max-h-[min(60vh,520px)] overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                <thead className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_var(--color-line)]">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {[
                      "Finished",
                      "Status",
                      "Trigger",
                      "By",
                      "Duration",
                      "API batches",
                      "Records",
                      "Notes",
                    ].map((h) => (
                      <th key={h} className="px-2 py-2 font-semibold first:pl-0">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-line align-top hover:bg-background/60"
                    >
                      <td className="whitespace-nowrap px-2 py-2.5 first:pl-0 tabular-nums">
                        {formatWhen(row.finishedAt)}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <StatusDot status={row.ok ? "good" : "bad"} />
                          {row.ok ? "OK" : "Errors"}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">{triggerLabel(row)}</td>
                      <td className="max-w-[140px] truncate px-2 py-2.5 text-muted">
                        {row.triggeredBy ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">
                        {formatDuration(row.durationMs)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {row.nexhealthRequestCount}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {row.upsertTotal.toLocaleString()}
                      </td>
                      <td className="max-w-[200px] truncate px-2 py-2.5 text-muted">
                        {row.errorSummary ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={total}
              pageSize={pageSize}
              label="runs"
              onChange={onPageChange}
            />
          </>
        )}
      </Card>
    </>
  );
}
