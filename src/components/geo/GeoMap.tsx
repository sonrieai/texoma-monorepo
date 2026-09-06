"use client";

import dynamic from "next/dynamic";
import type { GeoCity } from "@/lib/types/viz";
import { LoadingBox } from "@/components/ui/States";

const GeoMapInner = dynamic(
  () => import("./GeoMapInner").then((m) => m.GeoMapInner),
  {
    ssr: false,
    loading: () => (
      <LoadingBox className="h-[360px] rounded-lg border border-line bg-background" />
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
