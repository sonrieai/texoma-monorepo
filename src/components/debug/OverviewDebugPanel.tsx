"use client";

import { useState } from "react";
import type { OverviewDebug } from "@/lib/debug/nexhealth-debug";
import { Card, SectionHeading } from "@/components/ui/Cards";

export function OverviewDebugPanel({ debug }: { debug: OverviewDebug }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mt-4">
      <SectionHeading title="Data debug (dev)" tag="UI ↔ JSON" />
      <Card
        title="Overview cards → JSON paths"
        subtitle={debug.howToRead}
        className="border-accent/25 bg-notice-bg/40"
      >
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-line bg-card px-2.5 py-1 text-[12px] font-semibold text-foreground"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide mapping" : "Show mapping"}
          </button>
          <span className="text-[11px] text-muted">
            Generated {new Date(debug.generatedAt).toLocaleString()} · also
            logged in the server terminal
          </span>
        </div>

        {open ? (
          <>
            <div className="-mx-0.5 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[12px]">
                <thead>
                  <tr>
                    {["UI card / field", "JSON path", "Value", "Source"].map(
                      (h) => (
                        <th
                          key={h}
                          className="border-b border-line px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {debug.mapping.map((row) => (
                    <tr key={row.ui} className="align-top">
                      <td className="border-b border-line px-2 py-1.5 font-semibold">
                        {row.ui}
                      </td>
                      <td className="border-b border-line px-2 py-1.5 font-mono text-[11px] text-accent2">
                        {row.jsonPath}
                      </td>
                      <td className="border-b border-line px-2 py-1.5 tabular-nums">
                        {String(row.value)}
                      </td>
                      <td className="border-b border-line px-2 py-1.5 text-muted">
                        {row.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-semibold text-accent2">
                Raw debug JSON (safe aggregates)
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-card p-2.5 text-[11px] leading-relaxed text-foreground">
                {JSON.stringify(debug, null, 2)}
              </pre>
            </details>
          </>
        ) : null}
      </Card>
    </div>
  );
}
