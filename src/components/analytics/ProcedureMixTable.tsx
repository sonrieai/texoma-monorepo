import { Card } from "@/components/ui/Cards";
import { centsToDollars, formatUsd } from "@/lib/metrics";
import type { ProcedureMixRow } from "@/lib/warehouse/production";

type Props = {
  rows: ProcedureMixRow[];
  title?: string;
  subtitle?: string;
};

export function ProcedureMixTable({
  rows,
  title = "Procedure mix",
  subtitle = "Top procedure codes · amounts only · no patient identifiers",
}: Props) {
  const maxCents = Math.max(...rows.map((r) => r.productionCents), 1);

  return (
    <Card title={title} subtitle={subtitle}>
      <div className="-mx-0.5 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {["Code", "Name", "Count", "Production"].map((h) => (
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
            {rows.map((row) => {
              const share = row.productionCents / maxCents;
              return (
                <tr key={row.code} className="hover:bg-background/80">
                  <td className="border-b border-line px-2 py-2 font-semibold tabular-nums">
                    {row.code}
                  </td>
                  <td className="border-b border-line px-2 py-2">{row.name}</td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {row.count}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    <div className="flex flex-col items-center gap-1">
                      <span>
                        {formatUsd(centsToDollars(row.productionCents))}
                      </span>
                      <span
                        className="block h-1 w-full max-w-[72px] overflow-hidden rounded-full bg-line"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-accent2"
                          style={{
                            width: `${Math.min(100, Math.round(share * 100))}%`,
                          }}
                        />
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
