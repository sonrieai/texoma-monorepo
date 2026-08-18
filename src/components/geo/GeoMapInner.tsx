"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { GeoCity } from "@/lib/types/viz";
import "leaflet/dist/leaflet.css";

export function GeoMapInner({
  cities,
  metric,
}: {
  cities: (GeoCity & { lat: number; lon: number })[];
  metric: "patients" | "production";
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready) return null;

  const values = cities.map((c) =>
    metric === "production" ? (c.production ?? 0) : c.patients,
  );
  const max = Math.max(...values, 1);
  const center: [number, number] = [
    cities.reduce((s, c) => s + c.lat, 0) / cities.length,
    cities.reduce((s, c) => s + c.lon, 0) / cities.length,
  ];

  return (
    <MapContainer
      center={center}
      zoom={8}
      scrollWheelZoom
      className="h-[360px] w-full rounded-lg border border-line"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cities.map((c) => {
        const v = metric === "production" ? (c.production ?? 0) : c.patients;
        const radius = 6 + (v / max) * 18;
        if (metric === "production" && c.production == null) return null;
        return (
          <CircleMarker
            key={c.city}
            center={[c.lat, c.lon]}
            radius={radius}
            pathOptions={{
              color: "#1c150f",
              fillColor: "#b06a4f",
              fillOpacity: 0.55,
              weight: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <span className="text-[12px]">
                <b>{c.city}</b>
                <br />
                {c.patients} patients
                {c.production != null && c.production > 0
                  ? ` · ${c.production.toLocaleString()} prod`
                  : ""}
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
