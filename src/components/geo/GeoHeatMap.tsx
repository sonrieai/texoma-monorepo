"use client";

import dynamic from "next/dynamic";
import type { GeoCity } from "@/lib/types/viz";

const GeoHeatMapInner = dynamic(
  () => import("./GeoHeatMapInner").then((m) => m.GeoHeatMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-lg border border-line bg-background text-[12px] text-muted">
        Loading map…
      </div>
    ),
  },
);

export { MetricToggle } from "./GeoHeatMapInner";

export function GeoHeatMap(props: {
  cities: (GeoCity & { lat: number; lon: number })[];
  metric: "patients" | "production";
  onMetricChange: (metric: "patients" | "production") => void;
}) {
  return <GeoHeatMapInner {...props} />;
}
