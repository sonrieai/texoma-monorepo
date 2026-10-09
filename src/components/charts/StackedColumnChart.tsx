"use client";

import { useCallback, useRef, useState } from "react";
import { CHANNEL_COLORS } from "@/lib/types/viz";
import { formatUsdCompact } from "@/lib/metrics";
import {
  ChartTooltip,
  ChartTooltipRow,
  positionChartTooltip,
  type TooltipPosition,
} from "@/components/charts/chart-tooltip";

export type StackType = { key: string; label: string; color?: string };

export type StackRow = {
  label: string;
  values: Record<string, number>;
};

type ColumnHover = {
  rowIndex: number;
  typeKey: string | null;
  position: TooltipPosition;
};

export function StackedColumnChart({
  rows,
  types,
  width = 780,
  height = 300,
  mode: modeProp,
  onModeChange,
  showToggle = true,
  showLegend = true,
}: {
  rows: StackRow[];
  types: StackType[];
  width?: number;
  height?: number;
  mode?: "num" | "pct";
  onModeChange?: (mode: "num" | "pct") => void;
  showToggle?: boolean;
  showLegend?: boolean;
}) {
  const [internalMode, setInternalMode] = useState<"num" | "pct">("num");
  const mode = modeProp ?? internalMode;
  const setMode = (next: "num" | "pct") => {
    onModeChange?.(next);
    if (modeProp == null) setInternalMode(next);
  };

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<ColumnHover | null>(null);

  const pad = { l: 48, r: 14, t: 14, b: 26 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const totals = rows.map((r) =>
    types.reduce((sum, t) => sum + (r.values[t.key] ?? 0), 0),
  );
  const rawMax = rows.length > 0 ? Math.max(...totals, 1) : 1;
  const niceMax =
    mode === "pct" ? 100 : Math.ceil(rawMax / 1000) * 1000 || 1000;
  const gap = rows.length > 0 ? plotW / rows.length : plotW;
  const barW = Math.min(46, gap * 0.6);
  const ticks = 4;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const wrapRect = wrapRef.current?.getBoundingClientRect();
      if (!wrapRect) return;

      const sx = ((e.clientX - rect.left) / rect.width) * width;
      const sy = ((e.clientY - rect.top) / rect.height) * height;

      if (
        sx < pad.l ||
        sx > width - pad.r ||
        sy < pad.t ||
        sy > pad.t + plotH
      ) {
        setHover(null);
        return;
      }

      const rowIndex = Math.floor((sx - pad.l) / gap);
      if (rowIndex < 0 || rowIndex >= rows.length) {
        setHover(null);
        return;
      }

      const row = rows[rowIndex];
      const tot = totals[rowIndex] || 1;
      let accH = 0;
      let typeKey: string | null = null;

      for (const t of types) {
        const v = row.values[t.key] ?? 0;
        if (v <= 0) continue;
        const frac = mode === "pct" ? v / tot : v / niceMax;
        const segH = frac * plotH;
        const yTop = pad.t + plotH - accH - segH;
        if (sy >= yTop && sy <= yTop + segH) {
          typeKey = t.key;
          break;
        }
        accH += segH;
      }

      setHover({
        rowIndex,
        typeKey,
        position: positionChartTooltip(e.clientX, e.clientY, wrapRect),
      });
    },
    [gap, mode, niceMax, plotH, rows, totals, types, width],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  if (rows.length === 0) {
    return (
      <p className="m-0 py-6 text-center text-[12px] text-muted">
        No treatment-by-type data in range.
      </p>
    );
  }

  const hoveredRow = hover != null ? rows[hover.rowIndex] : null;
  const hoveredTotal = hover != null ? totals[hover.rowIndex] || 0 : 0;

  return (
    <div ref={wrapRef} className="relative">
      {showToggle ? (
        <div className="mb-3 flex justify-end gap-1">
          <button
            type="button"
            onClick={() => setMode("num")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
              mode === "num"
                ? "bg-sidebar text-white"
                : "bg-background text-muted"
            }`}
          >
            #
          </button>
          <button
            type="button"
            onClick={() => setMode("pct")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
              mode === "pct"
                ? "bg-sidebar text-white"
                : "bg-background text-muted"
            }`}
          >
            %
          </button>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        className="max-h-[320px] cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {Array.from({ length: ticks + 1 }, (_, k) => {
          const val = (niceMax * k) / ticks;
          const y = pad.t + plotH - (k / ticks) * plotH;
          return (
            <g key={k}>
              <line
                x1={pad.l}
                y1={y}
                x2={width - pad.r}
                y2={y}
                stroke="var(--line)"
              />
              <text
                x={pad.l - 7}
                y={y + 3}
                textAnchor="end"
                fontSize={9.5}
                fill="var(--muted)"
              >
                {mode === "pct" ? `${Math.round(val)}%` : formatUsdCompact(val)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const cx = pad.l + gap * i + gap / 2;
          const tot = totals[i] || 1;
          let accH = 0;
          const isHoveredCol = hover?.rowIndex === i;
          return (
            <g key={`${i}-${r.label}`}>
              {types.map((t, ti) => {
                const v = r.values[t.key] ?? 0;
                if (v <= 0) return null;
                const frac = mode === "pct" ? v / tot : v / niceMax;
                const segH = frac * plotH;
                const yTop = pad.t + plotH - accH - segH;
                accH += segH;
                const color =
                  t.color ?? CHANNEL_COLORS[ti % CHANNEL_COLORS.length];
                const isActive =
                  isHoveredCol &&
                  (hover?.typeKey == null || hover.typeKey === t.key);
                return (
                  <rect
                    key={t.key}
                    x={cx - barW / 2}
                    y={yTop}
                    width={barW}
                    height={Math.max(0, segH)}
                    fill={color}
                    opacity={isActive ? 1 : isHoveredCol ? 0.72 : 0.92}
                    stroke={isActive && hover?.typeKey === t.key ? "#33413a" : undefined}
                    strokeWidth={isActive && hover?.typeKey === t.key ? 1.5 : 0}
                  />
                );
              })}
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                fontSize={9.5}
                fill="var(--muted)"
              >
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTooltip position={hover?.position ?? null}>
        {hoveredRow ? (
          <>
            <div className="mb-1.5 text-[12.5px] font-bold">{hoveredRow.label}</div>
            {types.map((t, ti) => {
              const v = hoveredRow.values[t.key] ?? 0;
              if (v <= 0) return null;
              if (hover?.typeKey && hover.typeKey !== t.key) return null;
              const color =
                t.color ?? CHANNEL_COLORS[ti % CHANNEL_COLORS.length];
              const pct =
                hoveredTotal > 0 ? Math.round((100 * v) / hoveredTotal) : 0;
              return (
                <ChartTooltipRow
                  key={t.key}
                  color={color}
                  label={t.label}
                  value={
                    mode === "pct"
                      ? `${pct}%`
                      : `${formatUsdCompact(v)} · ${pct}%`
                  }
                />
              );
            })}
            {hover?.typeKey == null && hoveredTotal > 0 ? (
              <>
                <div className="my-1.5 h-px bg-line" />
                <ChartTooltipRow
                  label="Total"
                  value={formatUsdCompact(hoveredTotal)}
                  muted
                />
              </>
            ) : null}
          </>
        ) : null}
      </ChartTooltip>
      {showLegend ? (
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
          {types.map((t, i) => (
            <span key={t.key} className="inline-flex items-center gap-1.5">
              <i
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{
                  background: t.color ?? CHANNEL_COLORS[i % CHANNEL_COLORS.length],
                }}
              />
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
