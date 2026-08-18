"use client";

import { useCallback, useRef, useState } from "react";
import { CHANNEL_COLORS } from "@/lib/types/viz";
import { formatUsd, formatUsdCompact } from "@/lib/metrics";
import {
  ChartTooltip,
  ChartTooltipRow,
  positionChartTooltip,
  type TooltipPosition,
} from "@/components/charts/chart-tooltip";

export type LineSeries = {
  label: string;
  values: (number | null)[];
  color?: string;
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const PAD = { l: 52, r: 16, t: 14, b: 28 };
const TICK_COUNT = 4;

function finiteValues(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v != null && Number.isFinite(v));
}

/** Round Y max to clean ticks (mockup uses $10k steps for large ranges). */
function niceMoneyMax(dataMax: number): number {
  if (dataMax <= 0) return 1000;
  if (dataMax >= 10_000) {
    return Math.ceil(dataMax / 10_000) * 10_000;
  }
  const rawStep = dataMax / TICK_COUNT;
  const exp = 10 ** Math.floor(Math.log10(rawStep));
  const frac = rawStep / exp;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  const step = niceFrac * exp;
  return Math.ceil(dataMax / step) * step;
}

function chartBounds(
  series: LineSeries[],
  money: boolean,
): { min: number; max: number; ticks: number[] } {
  const all = series.flatMap((s) => finiteValues(s.values));
  if (money) {
    const max = niceMoneyMax(all.length ? Math.max(...all) : 0);
    const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, k) => (k / TICK_COUNT) * max);
    return { min: 0, max, ticks };
  }
  const min = all.length ? Math.min(...all, 0) : 0;
  const max = all.length ? Math.max(...all, 1) : 1;
  const ticks = Array.from(
    { length: TICK_COUNT + 1 },
    (_, k) => min + (k / TICK_COUNT) * (max - min),
  );
  return { min, max, ticks };
}

function polylineSegments(
  values: (number | null)[],
  xAt: (i: number) => number,
  yAt: (v: number) => number,
): string[] {
  const segments: string[] = [];
  let run: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      if (run.length) {
        segments.push(run.join(" "));
        run = [];
      }
      continue;
    }
    run.push(`${xAt(i)},${yAt(v)}`);
  }
  if (run.length) segments.push(run.join(" "));
  return segments;
}

type HoverState = TooltipPosition & {
  index: number;
};

function formatTooltipValue(v: number | null | undefined, money: boolean): string {
  if (v == null) return "—";
  return money ? formatUsd(v) : String(Math.round(v));
}

export function LineChart({
  series: seriesProp,
  xLabels = [...MONTH_LABELS],
  width = 860,
  height = 280,
  money = true,
}: {
  series: LineSeries[];
  xLabels?: string[];
  width?: number;
  height?: number;
  money?: boolean;
}) {
  const year = new Date().getFullYear();
  const series =
    seriesProp.length > 0
      ? seriesProp
      : [
          {
            label: String(year - 2),
            values: Array<number>(12).fill(0),
            color: CHANNEL_COLORS[3],
          },
          {
            label: String(year - 1),
            values: Array<number>(12).fill(0),
            color: CHANNEL_COLORS[2],
          },
          {
            label: String(year),
            values: Array<number>(12).fill(0),
            color: CHANNEL_COLORS[0],
          },
        ];

  const { min, max, ticks } = chartBounds(series, money);
  const plotW = width - PAD.l - PAD.r;
  const plotH = height - PAD.t - PAD.b;
  const count = series[0]?.values.length ?? 12;

  const xAt = (i: number) =>
    PAD.l + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW);
  const yAt = (v: number) =>
    PAD.t + plotH - ((v - min) / (max - min || 1)) * plotH;

  const fmt = (v: number) =>
    money ? formatUsdCompact(v) : String(Math.round(v));

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * width;
      let index = Math.round(((sx - PAD.l) / plotW) * (count - 1));
      index = Math.max(0, Math.min(count - 1, index));

      const wrapRect = wrapRef.current?.getBoundingClientRect();
      if (!wrapRect) return;

      const pos = positionChartTooltip(e.clientX, e.clientY, wrapRect);

      setHover({
        index,
        left: pos.left,
        top: pos.top,
      });
    },
    [count, plotW, width],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  const hoverIndex = hover?.index ?? 0;
  const guideX = hover != null ? xAt(hoverIndex) : 0;
  const latestSeries = series[series.length - 1];
  const latestValue = latestSeries?.values[hoverIndex];

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        className="max-h-[320px] cursor-crosshair"
        role="img"
        aria-label="Monthly production trend by year"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {ticks.map((tick) => {
          const yy = yAt(tick);
          return (
            <g key={tick}>
              <line
                x1={PAD.l}
                y1={yy}
                x2={width - PAD.r}
                y2={yy}
                stroke="var(--line)"
              />
              <text
                x={PAD.l - 8}
                y={yy + 3}
                textAnchor="end"
                fontSize={9.5}
                fill="var(--muted)"
              >
                {fmt(tick)}
              </text>
            </g>
          );
        })}
        {series.map((s, si) => {
          const color = s.color ?? CHANNEL_COLORS[si % CHANNEL_COLORS.length];
          const segments = polylineSegments(s.values, xAt, yAt);
          return (
            <g key={s.label}>
              {segments.map((pts, idx) => (
                <polyline
                  key={idx}
                  points={pts}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </g>
          );
        })}
        {xLabels.slice(0, count).map((m, i) => (
          <text
            key={`${m}-${i}`}
            x={xAt(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize={9.5}
            fill="var(--muted)"
          >
            {m}
          </text>
        ))}
        {hover != null && (
          <>
            <line
              x1={guideX}
              y1={PAD.t}
              x2={guideX}
              y2={PAD.t + plotH}
              stroke="#33413a"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            {series.map((s, si) => {
              const v = s.values[hoverIndex];
              if (v == null) return null;
              const color =
                s.color ?? CHANNEL_COLORS[si % CHANNEL_COLORS.length];
              return (
                <circle
                  key={s.label}
                  cx={guideX}
                  cy={yAt(v)}
                  r={4.5}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={1.6}
                />
              );
            })}
          </>
        )}
      </svg>
      {hover != null && (
        <ChartTooltip position={{ left: hover.left, top: hover.top }}>
          <div className="mb-1.5 text-[12.5px] font-bold">
            {xLabels[hoverIndex] ?? ""}
          </div>
          {series.map((s, si) => {
            const color =
              s.color ?? CHANNEL_COLORS[si % CHANNEL_COLORS.length];
            return (
              <ChartTooltipRow
                key={s.label}
                color={color}
                label={s.label}
                value={formatTooltipValue(s.values[hoverIndex], money)}
              />
            );
          })}
          {series.length > 1 && latestValue != null && (
            <>
              <div className="my-1.5 h-px bg-line" />
              {series.slice(0, -1).map((s) => {
                const base = s.values[hoverIndex];
                const delta =
                  base != null && base !== 0
                    ? ((latestValue - base) / base) * 100
                    : 0;
                const up = delta >= 0;
                return (
                  <div
                    key={s.label}
                    className="flex items-center justify-between gap-4 py-px text-[11px] text-muted"
                  >
                    <span>
                      {latestSeries.label} vs {s.label}
                    </span>
                    <b style={{ color: up ? "var(--good)" : "var(--bad)" }}>
                      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
                    </b>
                  </div>
                );
              })}
            </>
          )}
        </ChartTooltip>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-3 text-[11.5px] text-muted">
        {series.map((s, si) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <i
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{
                background:
                  s.color ?? CHANNEL_COLORS[si % CHANNEL_COLORS.length],
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export { clipCurrentYearMonths } from "@/lib/charts/production-trend";
