"use client";

import dynamic from "next/dynamic";
import type { GeoCity } from "@/lib/types/viz";
import { LoadingBox } from "@/components/ui/States";

const GeoHeatMapInner = dynamic(
  () => import("./GeoHeatMapInner").then((m) => m.GeoHeatMap),
  {
    ssr: false,
    loading: () => (
      <LoadingBox className="h-[420px] rounded-lg border border-line bg-background" />
    ),
  },
);

export function GeoHeatMap(props: {
  cities: (GeoCity & { lat: number; lon: number })[];
  metric: "patients" | "production";
  onMetricChange: (metric: "patients" | "production") => void;
}) {
  return <GeoHeatMapInner {...props} />;
}
