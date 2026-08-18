import { formatUsd } from "@/lib/metrics";
import type { GeoCity } from "@/lib/types/viz";

const BAR_COLORS = [
  "#b06a4f",
  "#0f3140",
  "#5a8a72",
  "#c49a6c",
  "#3d6b8c",
  "#8b6914",
  "#6b5344",
  "#2d6a4f",
] as const;

const LABEL_W = 120;
const ROW_H = 30;
const BAR_MAX = 280;
const VALUE_PAD = 64;

export function GeoCityProductionBars({ cities }: { cities: GeoCity[] }) {
  const rows = cities.filter((c) => (c.production ?? 0) > 0);
  if (rows.length === 0) {
    return (
      <p className="m-0 text-[13px] text-muted">
        Production by city appears when charges map to patient addresses.
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => r.production ?? 0), 1);
  const width = LABEL_W + BAR_MAX + VALUE_PAD;
  const height = rows.length * ROW_H + 8;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-[600px]"
      role="img"
      aria-label="Production by city"
    >
      {rows.map((row, index) => {
        const value = row.production ?? 0;
        const barW = Math.max(1, (value / max) * BAR_MAX);
        const y = index * ROW_H + 4;
        const label = row.city.split(",")[0];
        const color = BAR_COLORS[index % BAR_COLORS.length];

        return (
          <g key={row.city} transform={`translate(0, ${y})`}>
            <text x={0} y={15} fontSize={12} fill="currentColor">
              {label}
            </text>
            <rect
              x={LABEL_W}
              y={4}
              width={barW}
              height={16}
              rx={4}
              fill={color}
            />
            <text
              x={LABEL_W + 5 + barW}
              y={16}
              fontSize={11.5}
              fill="var(--color-muted, #6b7280)"
            >
              {formatUsd(value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
