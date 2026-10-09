"use client";

import { useCallback, useRef, useState } from "react";
import { CHANNEL_COLORS } from "@/lib/types/viz";
import { formatUsd } from "@/lib/metrics";
import {
  ChartTooltip,
  ChartTooltipRow,
  positionChartTooltip,
  type TooltipPosition,
} from "@/components/charts/chart-tooltip";

type Slice = { label: string; value: number };

type DonutHover = {
  index: number;
  position: TooltipPosition;
};

export function DonutChart({
  slices,
  size = 220,
  centerLabel,
  centerSub,
  showLegend = true,
  legendFormat = "label",
  legendPlacement = "below",
}: {
  slices: Slice[];
  size?: number;
  centerLabel?: string;
  centerSub?: string;
  showLegend?: boolean;
  legendFormat?: "label" | "percent";
  legendPlacement?: "below" | "right";
}) {
  const sum = slices.reduce((a, s) => a + s.value, 0);
  const total = sum || 1;
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -Math.PI / 2;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<DonutHover | null>(null);

  const showTooltip = useCallback(
    (index: number, e: React.MouseEvent<SVGElement>) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHover({
        index,
        position: positionChartTooltip(e.clientX, e.clientY, rect),
      });
    },
    [],
  );

  const paths = slices.map((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const color = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
    if (slices.length === 1 && s.value > 0) {
      return (
        <circle
          key={s.label}
          cx={cx}
          cy={cy}
          r={r}
          fill={color}
          className="cursor-pointer transition-opacity hover:opacity-80"
          onMouseEnter={(e) => showTooltip(i, e)}
          onMouseMove={(e) => showTooltip(i, e)}
          onMouseLeave={() => setHover(null)}
        />
      );
    }
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return (
      <path
        key={s.label}
        d={d}
        fill={color}
        className="cursor-pointer transition-opacity hover:opacity-80"
        onMouseEnter={(e) => showTooltip(i, e)}
        onMouseMove={(e) => showTooltip(i, e)}
        onMouseLeave={() => setHover(null)}
      />
    );
  });

  const legend = showLegend ? (
    <div
      className={
        legendPlacement === "right"
          ? "flex flex-col gap-1.5 text-[12px] text-muted"
          : "flex flex-wrap justify-center gap-2.5 text-[11.5px] text-muted"
      }
    >
      {slices.map((s, i) => (
        <span key={s.label} className="inline-flex items-center gap-1.5">
          <i
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }}
          />
          {legendFormat === "percent"
            ? `${s.label} ${sum > 0 ? Math.round((100 * s.value) / total) : 0}%`
            : s.label}
        </span>
      ))}
    </div>
  ) : null;

  const hovered = hover != null ? slices[hover.index] : null;
  const hoveredColor =
    hover != null
      ? CHANNEL_COLORS[hover.index % CHANNEL_COLORS.length]
      : undefined;

  return (
    <div
      ref={wrapRef}
      className={
        legendPlacement === "right"
          ? "relative flex w-full min-w-0 flex-wrap items-center justify-center gap-4"
          : "relative flex w-full min-w-0 flex-col items-center gap-3"
      }
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        height="100%"
        className="mx-auto aspect-square max-w-[min(100%,240px)] sm:max-w-[280px]"
        style={{ maxWidth: size }}
        aria-hidden
      >
        {paths}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--card)" />
        {centerLabel ? (
          <text
            x={cx}
            y={centerSub ? cy - 2 : cy + 5}
            textAnchor="middle"
            className="fill-[var(--ink)] text-[18px] font-extrabold"
          >
            {centerLabel}
          </text>
        ) : null}
        {centerSub ? (
          <text
            x={cx}
            y={cy + 16}
            textAnchor="middle"
            className="fill-[var(--muted)] text-[11px]"
          >
            {centerSub}
          </text>
        ) : null}
      </svg>
      <ChartTooltip position={hover?.position ?? null}>
        {hovered ? (
          <>
            <div className="mb-1.5 text-[12.5px] font-bold">{hovered.label}</div>
            <ChartTooltipRow
              color={hoveredColor}
              label="Amount"
              value={formatUsd(hovered.value)}
            />
            <ChartTooltipRow
              label="Share"
              value={`${sum > 0 ? Math.round((100 * hovered.value) / total) : 0}%`}
              muted
            />
          </>
        ) : null}
      </ChartTooltip>
      {legend}
    </div>
  );
}

type BarHover = {
  index: number;
  position: TooltipPosition;
};

export function HBarChart({
  rows,
  money = true,
  labelWidth: _labelWidth,
  width: _width,
  maxWidth: _maxWidth,
}: {
  rows: { label: string; value: number; color?: string; count?: number }[];
  money?: boolean;
  /** @deprecated Layout is CSS-driven; kept for call-site compatibility. */
  labelWidth?: number;
  /** @deprecated Layout is CSS-driven; kept for call-site compatibility. */
  width?: number;
  /** @deprecated Layout is CSS-driven; kept for call-site compatibility. */
  maxWidth?: number;
}) {
  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => r.value), 1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<BarHover | null>(null);

  const showTooltip = useCallback(
    (index: number, e: React.MouseEvent<HTMLElement>) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHover({
        index,
        position: positionChartTooltip(e.clientX, e.clientY, rect),
      });
    },
    [],
  );

  const hovered = hover != null ? rows[hover.index] : null;
  const hoveredColor =
    hover != null
      ? rows[hover.index].color ??
        CHANNEL_COLORS[hover.index % CHANNEL_COLORS.length]
      : undefined;

  return (
    <div ref={wrapRef} className="relative space-y-2.5">
      {rows.map((r, i) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0;
        const color = r.color ?? CHANNEL_COLORS[i % CHANNEL_COLORS.length];
        const valueLabel = money ? formatUsd(r.value) : String(Math.round(r.value));
        const countLabel =
          money && r.count != null ? r.count.toLocaleString("en-US") : null;
        return (
          <div
            key={`${r.label}-${i}`}
            className="space-y-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(3rem,2fr)_auto] sm:items-center sm:gap-x-2 sm:space-y-0 md:grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_auto]"
            onMouseEnter={(e) => showTooltip(i, e)}
            onMouseMove={(e) => showTooltip(i, e)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex min-w-0 items-center justify-between gap-2 sm:contents">
              <span
                className="min-w-0 truncate text-[12px] font-semibold leading-tight text-foreground sm:font-normal"
                title={r.label}
              >
                {r.label}
              </span>
              <span className="shrink-0 text-right text-[11.5px] tabular-nums text-muted sm:hidden">
                {valueLabel}
                {countLabel != null ? (
                  <span className="mt-0.5 block text-[10.5px]">count {countLabel}</span>
                ) : null}
              </span>
            </div>
            <div
              className="h-4 min-w-0 overflow-hidden rounded bg-background/80"
              aria-hidden
            >
              {r.value > 0 ? (
                <div
                  className="h-full rounded transition-opacity hover:opacity-85"
                  style={{
                    width: `${Math.max(pct, 4)}%`,
                    background: color,
                  }}
                />
              ) : null}
            </div>
            <span className="hidden min-w-[2.25rem] shrink-0 text-right text-[11.5px] tabular-nums leading-tight text-muted sm:inline">
              {valueLabel}
              {countLabel != null ? (
                <span className="mt-0.5 block text-[10.5px]">count {countLabel}</span>
              ) : null}
            </span>
          </div>
        );
      })}
      <ChartTooltip position={hover?.position ?? null}>
        {hovered ? (
          <>
            <div className="mb-1.5 text-[12.5px] font-bold">{hovered.label}</div>
            <ChartTooltipRow
              color={hoveredColor}
              label={money ? "Production" : "Count"}
              value={money ? formatUsd(hovered.value) : String(Math.round(hovered.value))}
            />
            {money && hovered.count != null ? (
              <ChartTooltipRow
                label="Count"
                value={hovered.count.toLocaleString("en-US")}
              />
            ) : null}
            <ChartTooltipRow
              label="Share of max"
              value={`${Math.round((100 * hovered.value) / max)}%`}
              muted
            />
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}
