"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListSearch } from "@/components/ui/ListSearch";
import { Card } from "@/components/ui/Cards";
import { Pagination } from "@/components/ui/Pagination";
import { centsToDollars, formatCount, formatUsd, formatUsdFromCentsOrDash } from "@/lib/metrics";
import { LIST_PAGE_SIZE, slicePage } from "@/lib/ui/pagination";
import type { ProcedureVolume } from "@/lib/nexhealth/production";

export type ProviderTableRow = {
  id: string;
  name: string;
  appointmentCount: number;
  upcomingCount: number;
  showCount: number;
  noShowCount: number;
  cancelledCount: number;
  unknownCount: number;
  grossProductionCents?: number;
  procedureVolume?: ProcedureVolume;
  npConsultShow?: number;
};

export function ProviderTable({
  providers,
  productionAvailable = false,
}: {
  providers: ProviderTableRow[];
  productionAvailable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) => p.name.toLowerCase().includes(q));
  }, [providers, query]);

  const rows = useMemo(
    () => slicePage(filtered, page, LIST_PAGE_SIZE),
    [filtered, page],
  );

  function onSearch(next: string) {
    setQuery(next);
    setPage(1);
  }

  const showProductionCols = productionAvailable;

  return (
    <Card
      title="Providers"
      subtitle={
        showProductionCols
          ? "Production · implants · AOX · dentures · NP"
          : "Appointment counts"
      }
    >
      <ListSearch
        value={query}
        onChange={onSearch}
        label="Search providers"
        placeholder="Provider name…"
        resultCount={filtered.length}
        totalCount={providers.length}
      />

      {filtered.length === 0 ? (
        <p className="m-0 rounded-lg border border-line bg-background px-3 py-4 text-[13px] text-muted">
          No providers match “{query.trim()}”.
        </p>
      ) : (
        <>
          <div className="-mx-0.5 overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {[
                    "Provider",
                    "Appts",
                    ...(showProductionCols
                      ? [
                          "Production",
                          "Implants",
                          "AOX",
                          "Dentures",
                          "Remakes",
                          "NP seen",
                          "$/patient",
                        ]
                      : []),
                    "Shows",
                    "No-shows",
                    "Cancelled",
                    "Unknown",
                  ].map((h) => (
                    <th
                      key={h}
                      className="border-b border-line px-2 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted first:text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const vol = p.procedureVolume;
                  return (
                    <tr key={p.id} className="hover:bg-background/80">
                      <td className="border-b border-line px-2 py-2 text-left">
                        <Link
                          href={`/doctor/${p.id}`}
                          className="font-semibold text-accent no-underline hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                        {p.appointmentCount}
                      </td>
                      {showProductionCols ? (
                        <>
                          <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                            {formatUsdFromCentsOrDash(
                              p.grossProductionCents ?? 0,
                              productionAvailable,
                            )}
                          </td>
                          <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                            {formatCount(
                              vol?.implants ?? 0,
                              productionAvailable,
                            )}
                          </td>
                          <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                            {formatCount(vol?.aox ?? 0, productionAvailable)}
                          </td>
                          <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                            {formatCount(
                              vol?.dentures ?? 0,
                              productionAvailable,
                            )}
                          </td>
                          <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                            {formatCount(
                              vol?.remakes ?? 0,
                              productionAvailable,
                            )}
                          </td>
                          <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                            {(p.npConsultShow ?? 0) > 0 || productionAvailable
                              ? String(p.npConsultShow ?? 0)
                              : "—"}
                          </td>
                          <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                            {productionAvailable &&
                            (p.showCount > 0 || (p.npConsultShow ?? 0) > 0)
                              ? formatUsd(
                                  centsToDollars(
                                    Math.round(
                                      (p.grossProductionCents ?? 0) /
                                        Math.max(
                                          p.showCount ||
                                            (p.npConsultShow ?? 0),
                                          1,
                                        ),
                                    ),
                                  ),
                                )
                              : "—"}
                          </td>
                        </>
                      ) : null}
                      <td className="border-b border-line px-2 py-2 text-center tabular-nums text-good">
                        {p.showCount}
                      </td>
                      <td className="border-b border-line px-2 py-2 text-center tabular-nums text-bad">
                        {p.noShowCount}
                      </td>
                      <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                        {p.cancelledCount}
                      </td>
                      <td className="border-b border-line px-2 py-2 text-center tabular-nums text-muted">
                        {p.unknownCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={LIST_PAGE_SIZE}
            total={filtered.length}
            onChange={setPage}
          />
        </>
      )}
    </Card>
  );
}
