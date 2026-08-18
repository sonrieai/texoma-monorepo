"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet.heat";
import {
  MapContainer,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { GeoCity } from "@/lib/types/viz";
import "leaflet/dist/leaflet.css";

const HEAT_GRADIENT: Record<number, string> = {
  0.0: "#1a9850",
  0.3: "#66bd63",
  0.45: "#d9ef8b",
  0.58: "#fee08b",
  0.7: "#fdae61",
  0.82: "#f46d43",
  0.9: "#d73027",
  0.96: "#a10f18",
  1.0: "#7a0a0f",
};

const DEFAULT_CENTER: [number, number] = [33.9, -96.55];
const DEFAULT_ZOOM = 9;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildHeatPoints(
  cities: (GeoCity & { lat: number; lon: number })[],
  metric: "patients" | "production",
): [number, number, number][] {
  const values = cities.map((c) =>
    metric === "production" ? (c.production ?? 0) : c.patients,
  );
  const max = Math.max(...values, 1);
  const points: [number, number, number][] = [];

  cities.forEach((city, index) => {
    const ratio = values[index] / max;
    const count = Math.max(6, Math.round(8 + 72 * ratio));
    const spread = 0.012 + 0.02 * ratio;
    const rng = mulberry32(1000 + index * 131);
    for (let i = 0; i < count; i += 1) {
      const gx = rng() + rng() + rng() - 1.5;
      const gy = rng() + rng() + rng() - 1.5;
      points.push([
        city.lat + gy * spread,
        city.lon + gx * spread * 1.25,
        0.55,
      ]);
    }
  });

  return points;
}

function HeatLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();

  useEffect(() => {
    const layer = L.heatLayer(points, {
      radius: 28,
      blur: 22,
      minOpacity: 0.3,
      max: 2.7,
      gradient: HEAT_GRADIENT,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);

  return null;
}

function MapResizeFix() {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 160);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

export function GeoHeatMap({
  cities,
  metric,
  onMetricChange,
}: {
  cities: (GeoCity & { lat: number; lon: number })[];
  metric: "patients" | "production";
  onMetricChange: (metric: "patients" | "production") => void;
}) {
  const [ready, setReady] = useState(false);
  const [viewKey, setViewKey] = useState(0);

  useEffect(() => setReady(true), []);

  const center = useMemo<[number, number]>(() => {
    if (cities.length === 0) return DEFAULT_CENTER;
    const lat = cities.reduce((s, c) => s + c.lat, 0) / cities.length;
    const lon = cities.reduce((s, c) => s + c.lon, 0) / cities.length;
    return [lat, lon];
  }, [cities]);

  const heatPoints = useMemo(
    () => buildHeatPoints(cities, metric),
    [cities, metric],
  );

  if (!ready) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-lg border border-line bg-background text-[12px] text-muted">
        Loading map…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MetricToggle metric={metric} onChange={onMetricChange} />
        <div className="flex flex-wrap items-center gap-3.5">
          <HeatScaleLegend />
          <button
            type="button"
            className="rounded-lg border border-line bg-background px-2.5 py-1.5 text-[12px] font-semibold text-foreground hover:bg-card"
            onClick={() => setViewKey((k) => k + 1)}
          >
            ↺ Reset view
          </button>
        </div>
      </div>

      <MapContainer
        key={viewKey}
        center={center}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        className="h-[420px] w-full rounded-lg border border-line"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <HeatLayer points={heatPoints} />
        <MapResizeFix />
      </MapContainer>
    </div>
  );
}

export function MetricToggle({
  metric,
  onChange,
}: {
  metric: "patients" | "production";
  onChange: (metric: "patients" | "production") => void;
}) {
  const btn = (value: "patients" | "production", label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        metric === value
          ? "bg-accent text-white shadow-sm"
          : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="inline-flex rounded-lg border border-line bg-background p-0.5">
      {btn("production", "Color by production")}
      {btn("patients", "Color by patients")}
    </div>
  );
}

function HeatScaleLegend() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted">
      <span>Low</span>
      <span
        className="inline-block h-2.5 w-[150px] rounded-full"
        style={{
          background:
            "linear-gradient(90deg,#1a9850,#66bd63,#d9ef8b,#fee08b,#fdae61,#d73027,#7a0a0f)",
        }}
        aria-hidden
      />
      <span>High</span>
    </div>
  );
}
