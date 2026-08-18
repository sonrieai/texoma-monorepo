"use client";

type GaugeStatus = "good" | "warn" | "bad" | "neutral";

function gaugeStatus(
  value: number,
  good: number | undefined,
  warn: number | undefined,
  higherBetter: boolean,
): GaugeStatus {
  if (good == null || warn == null) return "good";
  if (higherBetter) {
    if (value >= good) return "good";
    if (value >= warn) return "warn";
    return "bad";
  }
  if (value <= good) return "good";
  if (value <= warn) return "warn";
  return "bad";
}

function statusColor(status: GaugeStatus): string {
  if (status === "good") return "var(--good)";
  if (status === "warn") return "var(--sand)";
  if (status === "bad") return "var(--bad)";
  return "var(--muted)";
}

const WIDTH = 200;
const HEIGHT = 118;
const CX = 100;
const CY = 104;
const RADIUS = 82;

export function GaugeChart({
  value,
  min = 0,
  max = 100,
  target,
  unit = "%",
  higherBetter = true,
  good,
  warn,
}: {
  value: number | null;
  min?: number;
  max?: number;
  target?: number;
  unit?: string;
  higherBetter?: boolean;
  good?: number;
  warn?: number;
}) {
  const range = max - min || 1;
  const frac =
    value == null ? 0 : Math.max(0, Math.min(1, (value - min) / range));
  const a0 = Math.PI;
  const a1 = Math.PI - frac * Math.PI;
  const x0 = CX + RADIUS * Math.cos(a0);
  const y0 = CY + RADIUS * Math.sin(a0);
  const x1 = CX + RADIUS * Math.cos(a1);
  const y1 = CY + RADIUS * Math.sin(a1);
  const status =
    value == null
      ? "neutral"
      : gaugeStatus(value, good, warn, higherBetter);
  const stroke = statusColor(status);
  const label = value == null ? "—" : `${Math.round(value)}${unit}`;
  const targetLabel = target != null ? `target ${target}${unit}` : "";

  let tick: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (target != null) {
    const tf = (target - min) / range;
    const ta = Math.PI - tf * Math.PI;
    tick = {
      x1: CX + (RADIUS - 11) * Math.cos(ta),
      y1: CY + (RADIUS - 11) * Math.sin(ta),
      x2: CX + (RADIUS + 11) * Math.cos(ta),
      y2: CY + (RADIUS + 11) * Math.sin(ta),
    };
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      role="img"
      aria-label={
        value == null
          ? "Gauge unavailable"
          : `Gauge ${label}${targetLabel ? `, ${targetLabel}` : ""}`
      }
    >
      <path
        d={`M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`}
        fill="none"
        stroke="var(--line)"
        strokeWidth={16}
        strokeLinecap="round"
      />
      {value != null && frac > 0 ? (
        <path
          d={`M ${x0} ${y0} A ${RADIUS} ${RADIUS} 0 ${frac > 0.5 ? 1 : 0} 1 ${x1} ${y1}`}
          fill="none"
          stroke={stroke}
          strokeWidth={16}
          strokeLinecap="round"
        />
      ) : null}
      {tick ? (
        <line
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke="var(--ink)"
          strokeWidth={2}
        />
      ) : null}
      <text
        x={CX}
        y={CY - 14}
        textAnchor="middle"
        fontSize={26}
        fontWeight={800}
        fill="var(--ink)"
      >
        {label}
      </text>
      <text
        x={CX}
        y={CY + 2}
        textAnchor="middle"
        fontSize={10.5}
        fill="var(--muted)"
      >
        {targetLabel}
      </text>
    </svg>
  );
}
