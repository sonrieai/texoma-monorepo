"use client";

import { useCallback, useRef, useState } from "react";
import { CHANNEL_COLORS } from "@/lib/types/viz";
import {
  ChartTooltip,
  ChartTooltipRow,
  positionChartTooltip,
  type TooltipPosition,
} from "@/components/charts/chart-tooltip";

type FunnelHover = {
  index: number;
  position: TooltipPosition;
};

export function FunnelChart({
  stages,
  variant = "center",
}: {
  stages: { label: string; value: number }[];
  /** Mockup TC funnel: bar centered, labels on the right with step conversion %. */
  variant?: "center" | "tc";
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const rowH = variant === "tc" ? 46 : 36;
  const width = 560;
  const barMax = width - 160;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<FunnelHover | null>(null);

  const showTooltip = useCallback(
    (index: number, e: React.MouseEvent<SVGGElement>) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHover({
        index,
        position: positionChartTooltip(e.clientX, e.clientY, rect),
      });
    },
    [],
  );

  const hovered = hover != null ? stages[hover.index] : null;
  const hoveredColor =
    hover != null
      ? CHANNEL_COLORS[hover.index % CHANNEL_COLORS.length]
      : undefined;
  const prior =
    hover != null && hover.index > 0 ? stages[hover.index - 1].value : 0;
  const stepPct =
    hover != null && hover.index > 0 && prior > 0
      ? Math.round((100 * stages[hover.index].value) / prior)
      : null;
  const topPct =
    hover != null && stages[0].value > 0
      ? Math.round((100 * stages[hover.index].value) / stages[0].value)
      : null;

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${width} ${stages.length * rowH + 8}`}
        width="100%"
        className="max-h-[280px]"
      >
        {stages.map((s, i) => {
          const barWidth = (s.value / max) * barMax;
          const y = i * rowH;
          const color = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
          const priorStage = i > 0 ? stages[i - 1].value : 0;
          const stageStepPct =
            i > 0 && priorStage > 0 ? Math.round((100 * s.value) / priorStage) : null;

          if (variant === "tc") {
            const x = (barMax - barWidth) / 2;
            return (
              <g
                key={s.label}
                transform={`translate(0, ${y})`}
                className="cursor-pointer"
                onMouseEnter={(e) => showTooltip(i, e)}
                onMouseMove={(e) => showTooltip(i, e)}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  x={x}
                  y={6}
                  width={Math.max(barWidth, 2)}
                  height={32}
                  rx={6}
                  fill={color}
                  className="transition-opacity hover:opacity-85"
                />
                <text
                  x={width - 150}
                  y={20}
                  fontSize={12}
                  fontWeight={700}
                  fill="var(--ink)"
                >
                  {s.label}
                </text>
                <text x={width - 150} y={34} fontSize={11} fill="var(--muted)">
                  {s.value.toLocaleString()}
                  {stageStepPct != null ? ` · ${stageStepPct}% of prior` : ""}
                </text>
              </g>
            );
          }

          const w = Math.max(80, (s.value / max) * 480);
          return (
            <g
              key={s.label}
              className="cursor-pointer"
              onMouseEnter={(e) => showTooltip(i, e)}
              onMouseMove={(e) => showTooltip(i, e)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={(width - w) / 2}
                y={y + 4}
                width={w}
                height={rowH - 8}
                rx={4}
                fill={color}
                opacity={0.85}
                className="transition-opacity hover:opacity-100"
              />
              <text
                x={width / 2}
                y={y + (rowH - 8) / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fill="white"
                fontWeight={600}
              >
                {s.label}: {s.value.toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTooltip position={hover?.position ?? null}>
        {hovered ? (
          <>
            <div className="mb-1.5 text-[12.5px] font-bold">{hovered.label}</div>
            <ChartTooltipRow
              color={hoveredColor}
              label="Count"
              value={hovered.value.toLocaleString()}
            />
            {stepPct != null ? (
              <ChartTooltipRow
                label="From prior stage"
                value={`${stepPct}%`}
                muted
              />
            ) : null}
            {topPct != null && hover != null && hover.index > 0 ? (
              <ChartTooltipRow
                label="From top of funnel"
                value={`${topPct}%`}
                muted
              />
            ) : null}
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}
