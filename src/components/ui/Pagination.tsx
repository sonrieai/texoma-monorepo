"use client";

import { LIST_PAGE_SIZE, pageCount } from "@/lib/ui/pagination";

type Props = {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
  label?: string;
};

export function Pagination({
  page,
  total,
  pageSize = LIST_PAGE_SIZE,
  onChange,
  label = "items",
}: Props) {
  const pages = pageCount(total, pageSize);
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="m-0 text-[11.5px] text-muted">
        Showing {from}–{to} of {total} {label}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="rounded-lg border border-line bg-card px-2.5 py-1 text-[12px] font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          Previous
        </button>
        <span className="min-w-[4rem] text-center text-[12px] font-semibold tabular-nums text-muted">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="rounded-lg border border-line bg-card px-2.5 py-1 text-[12px] font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  );
}
