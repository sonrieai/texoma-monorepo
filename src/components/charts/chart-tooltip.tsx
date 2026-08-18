"use client";

import type { ReactNode } from "react";

export type TooltipPosition = { left: number; top: number };

export function positionChartTooltip(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  tooltipWidth = 196,
): TooltipPosition {
  let left = clientX - containerRect.left + 16;
  if (left > containerRect.width - tooltipWidth) {
    left = clientX - containerRect.left - tooltipWidth - 8;
  }
  const top = Math.max(0, clientY - containerRect.top - 12);
  return { left: Math.max(4, left), top };
}

export function ChartTooltip({
  position,
  children,
}: {
  position: TooltipPosition | null;
  children: ReactNode;
}) {
  if (!position) return null;
  return (
    <div
      className="pointer-events-none absolute z-[6] min-w-[158px] max-w-[260px] rounded-[11px] border border-line bg-card px-3 py-2.5 text-xs shadow-[0_10px_26px_rgba(20,30,25,0.16)]"
      style={{ left: position.left, top: position.top }}
    >
      {children}
    </div>
  );
}

export function ChartTooltipRow({
  color,
  label,
  value,
  muted,
}: {
  color?: string;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-0.5 ${muted ? "text-[11px] text-muted" : ""}`}
    >
      <span className="inline-flex min-w-0 items-center">
        {color ? (
          <i
            className="mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: color }}
          />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      <b className="shrink-0 tabular-nums">{value}</b>
    </div>
  );
}
