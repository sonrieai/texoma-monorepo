import {
  agingHeatAlpha,
  arAgingDetailRows,
  arAgingTotalCents,
} from "@/lib/metrics/insurance";
import { centsToDollars, formatPct, formatUsd } from "@/lib/metrics";
import type { ArAgingBuckets } from "@/lib/nexhealth/ar";

const AGING_HEAT_RGB = "176, 106, 79";

export function AgingHeatMapTable({
  aging,
}: {
  aging: ArAgingBuckets;
}) {
  const rows = arAgingDetailRows(aging);
  const totalCents = arAgingTotalCents(aging);
  const maxCents = Math.max(1, ...rows.map((r) => r.cents));

  return (
    <table className="w-full border-collapse text-[12.5px]">
      <thead>
        <tr className="border-b border-line text-left">
          <th className="pb-2 font-semibold">Bucket</th>
          <th className="pb-2 text-right font-semibold">Balance</th>
          <th className="pb-2 text-right font-semibold">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const alpha = agingHeatAlpha(row.cents, maxCents);
          return (
            <tr key={row.label} className="border-b border-line">
              <td className="py-2 font-semibold">{row.label}</td>
              <td
                className="py-2 text-right tabular-nums"
                style={{ background: `rgba(${AGING_HEAT_RGB}, ${alpha.toFixed(3)})` }}
              >
                {formatUsd(centsToDollars(row.cents))}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatPct(row.share)}
              </td>
            </tr>
          );
        })}
        <tr className="font-bold">
          <td className="pt-2">Total insurance AR</td>
          <td className="pt-2 text-right tabular-nums">
            {formatUsd(centsToDollars(totalCents))}
          </td>
          <td className="pt-2 text-right tabular-nums">100%</td>
        </tr>
      </tbody>
    </table>
  );
}
