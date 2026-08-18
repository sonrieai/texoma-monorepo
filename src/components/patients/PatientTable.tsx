"use client";

import { useMemo, useState } from "react";
import { ListSearch } from "@/components/ui/ListSearch";
import { Card } from "@/components/ui/Cards";
import { Pagination } from "@/components/ui/Pagination";
import type { PatientDirectoryRow } from "@/lib/nexhealth/patients";
import { LIST_PAGE_SIZE, slicePage } from "@/lib/ui/pagination";

function Cell({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-muted">—</span>;
  }
  return <span>{value}</span>;
}

function matchesPatient(p: PatientDirectoryRow, q: string): boolean {
  const haystack = [
    p.name,
    p.phone,
    p.email,
    p.dateOfBirth,
    p.addressLine,
    p.city,
    p.state,
    p.postalCode,
    p.foreignId,
    p.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function PatientTable({ patients }: { patients: PatientDirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => matchesPatient(p, q));
  }, [patients, query]);

  const rows = useMemo(
    () => slicePage(filtered, page, LIST_PAGE_SIZE),
    [filtered, page],
  );

  function onSearch(next: string) {
    setQuery(next);
    setPage(1);
  }

  return (
    <Card
      title="Patient directory"
      subtitle="Fields shown when Synchronizer exposes them — empty cells mean missing on this sync"
    >
      <ListSearch
        value={query}
        onChange={onSearch}
        label="Search patients"
        placeholder="Name, phone, email, city, ZIP, EHR id…"
        resultCount={filtered.length}
        totalCount={patients.length}
      />

      {filtered.length === 0 ? (
        <p className="m-0 rounded-lg border border-line bg-background px-3 py-4 text-[13px] text-muted">
          No patients match “{query.trim()}”.
        </p>
      ) : (
        <>
          <div className="-mx-0.5 overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {[
                    "Name",
                    "DOB",
                    "Phone",
                    "Email",
                    "Address",
                    "City",
                    "State",
                    "ZIP",
                    "EHR id",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      className="border-b border-line px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-background/80">
                    <td className="border-b border-line px-2 py-2 font-semibold">
                      {p.name}
                    </td>
                    <td className="border-b border-line px-2 py-2 tabular-nums">
                      <Cell value={p.dateOfBirth} />
                    </td>
                    <td className="border-b border-line px-2 py-2 tabular-nums">
                      <Cell value={p.phone} />
                    </td>
                    <td className="border-b border-line px-2 py-2">
                      <Cell value={p.email} />
                    </td>
                    <td className="border-b border-line px-2 py-2">
                      <Cell value={p.addressLine} />
                    </td>
                    <td className="border-b border-line px-2 py-2">
                      <Cell value={p.city} />
                    </td>
                    <td className="border-b border-line px-2 py-2">
                      <Cell value={p.state} />
                    </td>
                    <td className="border-b border-line px-2 py-2 tabular-nums">
                      <Cell value={p.postalCode} />
                    </td>
                    <td className="border-b border-line px-2 py-2 tabular-nums">
                      <Cell value={p.foreignId} />
                    </td>
                    <td className="border-b border-line px-2 py-2">
                      {p.inactive ? (
                        <span className="text-warn">Inactive</span>
                      ) : (
                        <span className="text-good">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            total={filtered.length}
            onChange={setPage}
            label="patients"
          />
        </>
      )}
    </Card>
  );
}
