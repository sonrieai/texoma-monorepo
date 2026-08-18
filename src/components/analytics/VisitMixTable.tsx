import { Card } from "@/components/ui/Cards";
import { formatPct } from "@/lib/metrics";
import type { AppointmentTypeMixRow } from "@/lib/nexhealth/appointment-mix";

type Props = {
  rows: AppointmentTypeMixRow[];
  totalAppointments: number;
  subtitle?: string;
};

export function VisitMixTable({
  rows,
  totalAppointments,
  subtitle = "Counts by appointment type · no patient identifiers",
}: Props) {
  const denom = totalAppointments > 0 ? totalAppointments : 1;

  return (
    <Card title="Visit mix" subtitle={subtitle}>
      <div className="-mx-0.5 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {[
                "Type",
                "Appts",
                "% of total",
                "Shows",
                "No-shows",
                "Cancelled",
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
            {rows.map((row) => {
              const share = row.count / denom;
              return (
                <tr key={row.id} className="hover:bg-background/80">
                  <td className="border-b border-line px-2 py-2 font-semibold">
                    {row.name}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {row.count}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    <div className="flex flex-col items-center gap-1">
                      <span>{formatPct(share)}</span>
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
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {row.show}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {row.noShow}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {row.cancelled}
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
