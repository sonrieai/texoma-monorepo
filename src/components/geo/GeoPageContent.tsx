"use client";

import { useMemo, useState } from "react";
import { GeoCityProductionBars } from "@/components/geo/GeoCityProductionBars";
import { GeoHeatMap } from "@/components/geo/GeoHeatMap";
import { Card, ComboStat, NoticeList, SectionHeading } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/States";
import { centsToDollars, formatUsd } from "@/lib/metrics";
import type { GeoSummary } from "@/lib/warehouse/geo";
import type { GeoCity } from "@/lib/types/viz";

export function GeoPageContent({ geo }: { geo: GeoSummary }) {
  const [metric, setMetric] = useState<"patients" | "production">("production");

  const rows = geo.cities;
  const top = rows[0];
  const mapCities = useMemo(
    () =>
      geo.mapCities.filter(
        (c): c is GeoCity & { lat: number; lon: number } =>
          c.lat != null && c.lon != null,
      ),
    [geo.mapCities],
  );

  const trackedPatients = rows.reduce((sum, r) => sum + r.patients, 0);
  const trackedProduction = centsToDollars(geo.totalProductionCents);

  return (
    <>
      <NoticeList notices={geo.notices} />

      <div className="mb-4 grid grid-cols-2 items-stretch gap-2.5 md:grid-cols-4">
        <ComboStat
          label="Top area by production"
          value={top ? top.city.split(",")[0] : "—"}
          note={top?.production ? formatUsd(top.production) : undefined}
          size="lg"
        />
        <ComboStat
          label="Patients (tracked)"
          value={String(trackedPatients)}
          note={`across ${rows.length} cities`}
          size="lg"
        />
        <ComboStat
          label="Production (tracked)"
          value={formatUsd(trackedProduction)}
          note="mapped areas"
          size="lg"
        />
        <ComboStat
          label="Counties reached"
          value={String(geo.countiesReached)}
          note={`of ${geo.regionCountyCount} in region`}
          size="lg"
        />
      </div>

      <SectionHeading title="Texoma Patient Heat Map" tag="interactive" />
      <Card
        title="Where Patients & Production Come From"
        subtitle={`Heat density of ${metric} on a live map · scroll to zoom, drag to pan.`}
        className="mb-4"
      >
        {mapCities.length === 0 ? (
          <EmptyState
            title="No mappable addresses yet"
            description="City table below lists synced addresses. Map heat appears when cities geocode successfully."
          />
        ) : (
          <GeoHeatMap
            cities={mapCities}
            metric={metric}
            onMetricChange={setMetric}
          />
        )}
      </Card>

      {rows.length > 0 ? (
        <>
          <SectionHeading title="By City" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="Cities Ranked by Production" className="overflow-hidden p-0 sm:p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-[12.5px]">
                  <thead>
                    <tr>
                      {["City", "County", "Patients", "Production"].map((h) => (
                        <th
                          key={h}
                          className="border-b border-line px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted last:text-right"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.city} className="hover:bg-background/80">
                        <td className="border-b border-line px-3 py-2 font-semibold">
                          {r.city}
                        </td>
                        <td className="border-b border-line px-3 py-2 text-muted">
                          {r.county ?? "—"}
                        </td>
                        <td className="border-b border-line px-3 py-2 tabular-nums">
                          {r.patients}
                        </td>
                        <td className="border-b border-line px-3 py-2 text-right tabular-nums">
                          {r.production != null && r.production > 0
                            ? formatUsd(r.production)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Production by City">
              <GeoCityProductionBars cities={rows} />
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
