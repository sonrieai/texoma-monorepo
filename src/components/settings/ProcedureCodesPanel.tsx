"use client";

import { useMemo, useState } from "react";
import { Card, SectionHeading } from "@/components/ui/Cards";
import type { CdtCodeRow } from "@/lib/cdt/categories";

type Props = {
  initialCodes: CdtCodeRow[];
  feeScheduleNames: [string | null, string | null, string | null];
  loadError: string | null;
};

function feeColumnLabel(
  slot: 1 | 2 | 3,
  names: [string | null, string | null, string | null],
): string {
  const name = names[slot - 1];
  return name ? name : `Fee ${slot}`;
}

function formatFee(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return n.toFixed(2);
}

export function ProcedureCodesPanel({
  initialCodes,
  feeScheduleNames: initialFeeScheduleNames,
  loadError,
}: Props) {
  const [codes] = useState(initialCodes);
  const [feeScheduleNames] = useState(initialFeeScheduleNames);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return codes;
    return codes.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [codes, query]);

  return (
    <>
      {loadError ? (
        <p className="mb-4 text-[12px] text-bad">{loadError}</p>
      ) : null}

      <SectionHeading title="Procedure codes" tag={`${codes.length} total`} />
      <Card className="overflow-hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, description, category…"
            className="min-w-[220px] flex-1 rounded-lg border border-line bg-background px-3 py-2 text-[13px]"
          />
          <span className="text-[12px] text-muted">
            {query.trim()
              ? `${filtered.length} match${filtered.length === 1 ? "" : "es"} · ${codes.length} total`
              : `${codes.length} codes`}
          </span>
        </div>
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="w-full min-w-[880px] border-collapse text-[12.5px]">
            <thead className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_var(--color-line)]">
              <tr>
                {[
                  "Code",
                  "Category",
                  "Description",
                  feeColumnLabel(1, feeScheduleNames),
                  feeColumnLabel(2, feeScheduleNames),
                  feeColumnLabel(3, feeScheduleNames),
                  "Volume",
                  "Warranty",
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b border-line bg-card px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-2 py-6 text-center text-[12px] text-muted"
                  >
                    {codes.length === 0
                      ? "No procedure codes in warehouse — run npm run sync:nexhealth first."
                      : "No codes match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.code} className="hover:bg-background/80">
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 font-semibold tabular-nums">
                      {row.code}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2">
                      {row.category}
                    </td>
                    <td className="min-w-[200px] border-b border-line px-2 py-2 text-muted">
                      {row.description}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 tabular-nums">
                      {formatFee(row.fee1)}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 tabular-nums">
                      {formatFee(row.fee2)}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 tabular-nums">
                      {formatFee(row.fee3)}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 tabular-nums">
                      {row.volumeBucket ?? "—"}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 tabular-nums">
                      {row.warrantyBucket ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
