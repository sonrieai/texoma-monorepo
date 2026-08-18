"use client";

import { useMemo, useState } from "react";
import { ListSearch } from "@/components/ui/ListSearch";
import { Card, ComboStat } from "@/components/ui/Cards";
import { Pagination } from "@/components/ui/Pagination";
import { LIST_PAGE_SIZE, slicePage } from "@/lib/ui/pagination";

export type ProviderCard = {
  id: string;
  name: string;
  appointmentCount: number;
  upcomingCount: number;
  showCount: number;
  cancelledCount: number;
};

export function ProviderCardGrid({ providers }: { providers: ProviderCard[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) => p.name.toLowerCase().includes(q));
  }, [providers, query]);

  const pageItems = useMemo(
    () => slicePage(filtered, page, LIST_PAGE_SIZE),
    [filtered, page],
  );

  function onSearch(next: string) {
    setQuery(next);
    setPage(1);
  }

  return (
    <div className="mb-4">
      <ListSearch
        value={query}
        onChange={onSearch}
        label="Search providers"
        placeholder="Provider name…"
        resultCount={filtered.length}
        totalCount={providers.length}
      />

      {filtered.length === 0 ? (
        <p className="m-0 rounded-lg border border-line bg-card px-3 py-4 text-[13px] text-muted">
          No providers match “{query.trim()}”.
        </p>
      ) : (
        <>
          <div className="grid items-stretch gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((p) => (
              <Card key={p.id} title={p.name} className="flex h-full flex-col">
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  <ComboStat
                    variant="inset"
                    label="Appts"
                    value={String(p.appointmentCount)}
                  />
                  <ComboStat
                    variant="inset"
                    label="Upcoming"
                    value={String(p.upcomingCount)}
                  />
                  <ComboStat
                    variant="inset"
                    label="Shows"
                    value={String(p.showCount)}
                  />
                  <ComboStat
                    variant="inset"
                    label="Cancelled"
                    value={String(p.cancelledCount)}
                  />
                </div>
              </Card>
            ))}
          </div>
          <Pagination
            page={page}
            total={filtered.length}
            onChange={setPage}
            label="providers"
          />
        </>
      )}
    </div>
  );
}
