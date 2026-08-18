"use client";

import dynamic from "next/dynamic";
import type { GeoCity } from "@/lib/types/viz";

const GeoMapInner = dynamic(
  () => import("./GeoMapInner").then((m) => m.GeoMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] items-center justify-center rounded-lg border border-line bg-background text-[12px] text-muted">
        Loading map…
      </div>
    ),
  },
);

export function GeoMap({
  cities,
  metric = "patients",
}: {
  cities: GeoCity[];
  metric?: "patients" | "production";
}) {
  if (cities.length === 0) return null;

  const plottable = cities.filter(
    (c): c is GeoCity & { lat: number; lon: number } =>
      c.lat != null && c.lon != null,
  );
  if (plottable.length === 0) return null;

  return <GeoMapInner cities={plottable} metric={metric} />;
}
