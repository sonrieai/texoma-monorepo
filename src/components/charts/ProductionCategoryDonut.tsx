"use client";

import { useCallback, useRef, useState } from "react";
import { formatUsd } from "@/lib/metrics";
import type { ChartCategoryDef } from "@/lib/charts/category-chart";
import {
  ChartTooltip,
  positionChartTooltip,
  type TooltipPosition,
} from "@/components/charts/chart-tooltip";

type Slice = { label: string; value: number; color?: string };

type Hover = {
  index: number;
  position: TooltipPosition;
};

function sliceClass(hovered: boolean, active: boolean): string {
  const base = "cursor-pointer transition-[opacity,filter] duration-150";
  if (!hovered) return base;
  return active
    ? `${base} opacity-100 brightness-110 drop-shadow-[0_2px_6px_rgba(20,30,25,0.28)]`
    : `${base} opacity-50`;
}

function CategoryLegend({
  chartCategories,
  slices,
}: {
  chartCategories: ChartCategoryDef[];
  slices: Slice[];
}) {
  const valueByLabel = new Map(slices.map((s) => [s.label, s.value]));
  return (
    <div className="w-full min-w-0 shrink-0 rounded-[10px] border border-line bg-background px-3 py-3 sm:px-3.5 md:max-w-[200px] lg:w-[158px]">
      <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-muted">
        Treatment type
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
        {chartCategories.map((category) => {
          const value = valueByLabel.get(category.label) ?? 0;
          return (
            <div
              key={category.key}
              className="flex min-w-0 items-center justify-between gap-2 text-[11.5px] sm:text-[12px]"
            >
              <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <i
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: category.color }}
                />
                <span className="truncate">{category.label}</span>
              </span>
              {value > 0 ? (
                <span className="shrink-0 text-[10.5px] text-muted sm:text-[11px]">
                  {formatUsd(value)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Ring donut + dynamic Open Dental category legend. */
export function ProductionCategoryDonut({
  slices,
  chartCategories,
  size = 300,
  centerLabel,
  centerSub = "total",
  showLegend = true,
}: {
  slices: Slice[];
  chartCategories: ChartCategoryDef[];
  size?: number;
  centerLabel?: string;
  centerSub?: string;
  /** Prototype cockpit donut is hover-only, with no side legend. */
  showLegend?: boolean;
}) {
  const drawable = slices.filter((s) => s.value > 0);
  const sum = drawable.reduce((a, s) => a + s.value, 0);
  const total = sum || 1;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 6;
  const innerR = outerR * 0.6;

  const polar = (radius: number, deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)] as const;
  };

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

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

  let acc = 0;
  const paths =
    sum > 0
      ? drawable.length === 1
        ? [
            <circle
              key="full-ring"
              cx={cx}
              cy={cy}
              r={(outerR + innerR) / 2}
              fill="none"
              stroke={
                drawable[0].color ??
                chartCategories.find((c) => c.label === drawable[0].label)
                  ?.color ??
                chartCategories[0]?.color
              }
              strokeWidth={outerR - innerR}
              className={sliceClass(hover != null, true)}
              onMouseEnter={(e) => showTooltip(0, e)}
              onMouseMove={(e) => showTooltip(0, e)}
              onMouseLeave={() => setHover(null)}
            />,
          ]
        : drawable.map((s, i) => {
          const frac = s.value / total;
          const a0 = acc * 360;
          const a1 = (acc + frac) * 360;
          acc += frac;
          const [ox0, oy0] = polar(outerR, a0);
          const [ox1, oy1] = polar(outerR, a1);
          const [ix1, iy1] = polar(innerR, a1);
          const [ix0, iy0] = polar(innerR, a0);
          const large = a1 - a0 > 180 ? 1 : 0;
          const color =
            s.color ??
            chartCategories.find((c) => c.label === s.label)?.color ??
            chartCategories[i % chartCategories.length]?.color;
          const d = `M ${ox0} ${oy0} A ${outerR} ${outerR} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix0} ${iy0} Z`;
          return (
            <path
              key={`${s.label}-${i}`}
              d={d}
              fill={color}
              className={sliceClass(hover != null, hover?.index === i)}
              onMouseEnter={(e) => showTooltip(i, e)}
              onMouseMove={(e) => showTooltip(i, e)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })
      : [
          <circle
            key="empty-track"
            cx={cx}
            cy={cy}
            r={(outerR + innerR) / 2}
            fill="none"
            stroke="var(--line)"
            strokeWidth={outerR - innerR}
          />,
        ];

  const hovered = hover != null ? drawable[hover.index] : null;

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-center">
      <div
        ref={wrapRef}
        className="relative mx-auto aspect-square w-full max-w-[min(100%,240px)] sm:max-w-[280px] md:max-w-[300px]"
        style={{ maxWidth: size }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" aria-hidden>
          {paths}
          {centerLabel ? (
            <text
              x={cx}
              y={centerSub ? cy - 2 : cy + 5}
              textAnchor="middle"
              className="pointer-events-none fill-[var(--ink)] text-[26px] font-extrabold"
            >
              {centerLabel}
            </text>
          ) : null}
          {centerSub ? (
            <text
              x={cx}
              y={cy + 18}
              textAnchor="middle"
              className="pointer-events-none fill-[var(--muted)] text-[11px]"
            >
              {centerSub}
            </text>
          ) : null}
        </svg>
        {sum <= 0 ? (
          <p className="mt-2 text-center text-[12px] text-muted">
            No production in this period
          </p>
        ) : null}
        <ChartTooltip position={hover?.position ?? null} tone="dark">
          {hovered ? (
            <>
              <div className="font-bold">{hovered.label}</div>
              <div>
                {formatUsd(hovered.value)} ·{" "}
                {sum > 0 ? Math.round((100 * hovered.value) / total) : 0}%
              </div>
            </>
          ) : null}
        </ChartTooltip>
      </div>
      {showLegend ? (
        <CategoryLegend chartCategories={chartCategories} slices={slices} />
      ) : null}
    </div>
  );
}
