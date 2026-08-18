import { Card } from "@/components/ui/Cards";
import { formatUsd } from "@/lib/metrics";
import type { AdChannel } from "@/lib/ghl/marketing";

type JourneyRow = {
  name: string;
  leads: number;
  booked: number;
  showed: number;
  presented: number;
  closedPaid: number;
  production: number;
};

type JourneyMetricKey = Exclude<keyof JourneyRow, "name">;

const STAGES: { key: JourneyMetricKey; label: string; money?: boolean }[] = [
  { key: "leads", label: "Leads" },
  { key: "booked", label: "Booked" },
  { key: "showed", label: "Showed" },
  { key: "presented", label: "Presented" },
  { key: "closedPaid", label: "Closed / paid" },
  { key: "production", label: "Production", money: true },
];

function toRows(channels: AdChannel[]): JourneyRow[] {
  return channels.map((c) => ({
    name: c.name,
    leads: c.leads,
    booked: c.booked,
    showed: c.showed,
    presented: c.accepted,
    closedPaid: c.surgery,
    production: c.production,
  }));
}

function heatAlpha(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return 0.05 + 0.34 * (value / max);
}

function HeatCell({
  value,
  max,
  money = false,
}: {
  value: number;
  max: number;
  money?: boolean;
}) {
  const alpha = heatAlpha(value, max);
  return (
    <td
      className="border-b border-line px-1.5 py-2 text-center tabular-nums whitespace-nowrap"
      style={
        alpha > 0
          ? { background: `rgba(176, 106, 79, ${alpha.toFixed(3)})` }
          : undefined
      }
    >
      {money ? formatUsd(value) : value.toLocaleString()}
    </td>
  );
}

export function PatientJourneyTable({
  channels,
  periodLabel,
  subtitle,
}: {
  channels: AdChannel[];
  periodLabel: string;
  subtitle: string;
}) {
  const rows = toRows(channels);
  const maxByKey = Object.fromEntries(
    STAGES.map(({ key }) => [
      key,
      Math.max(1, ...rows.map((r) => r[key] as number)),
    ]),
  ) as Record<keyof JourneyRow, number>;

  const totals = rows.reduce(
    (acc, row) => ({
      leads: acc.leads + row.leads,
      booked: acc.booked + row.booked,
      showed: acc.showed + row.showed,
      presented: acc.presented + row.presented,
      closedPaid: acc.closedPaid + row.closedPaid,
      production: acc.production + row.production,
    }),
    {
      leads: 0,
      booked: 0,
      showed: 0,
      presented: 0,
      closedPaid: 0,
      production: 0,
    },
  );

  return (
    <Card
      title="Lead → Paid, by Source"
      subtitle={`${subtitle} · shading shows volume · ${periodLabel}`}
      className="overflow-hidden p-0 sm:p-0"
    >
      <div className="overflow-x-auto px-3.5 pb-3.5 sm:px-4 sm:pb-4">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="w-[14%] border-b border-line py-2 pl-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                Channel
              </th>
              {STAGES.map((s) => (
                <th
                  key={s.key}
                  className="border-b border-line px-1.5 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted"
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="hover:bg-background/80">
                <td className="border-b border-line py-2.5 pl-3 text-left font-bold">
                  {row.name}
                </td>
                {STAGES.map((s) => (
                  <HeatCell
                    key={s.key}
                    value={row[s.key] as number}
                    max={maxByKey[s.key]}
                    money={s.money}
                  />
                ))}
              </tr>
            ))}
            <tr className="font-bold">
              <td className="border-t-2 border-line py-2.5 pl-3">Total</td>
              {STAGES.map((s) => (
                <td
                  key={s.key}
                  className="border-t-2 border-line px-1.5 py-2.5 text-center tabular-nums"
                >
                  {s.money
                    ? formatUsd(totals[s.key] ?? 0)
                    : (totals[s.key] ?? 0).toLocaleString()}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
