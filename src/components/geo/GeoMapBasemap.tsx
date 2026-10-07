"use client";

import { useEffect, useState } from "react";
import type { Layer } from "leaflet";
import GoogleMutant from "leaflet.gridlayer.googlemutant/src/Leaflet.GoogleMutant.mjs";
import { TileLayer, useMap } from "react-leaflet";
import { getGoogleMapsApiKey } from "@/lib/geo/google-maps-api-key";
import { loadGoogleMapsScript } from "@/lib/geo/load-google-maps-script";

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function OsmBasemap() {
  return <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_URL} />;
}

function GoogleMutantBasemap({ apiKey }: { apiKey: string }) {
  const map = useMap();
  const [googleReady, setGoogleReady] = useState(false);
  const [useOsmOnly, setUseOsmOnly] = useState(false);

  useEffect(() => {
    if (useOsmOnly) return;

    let googleLayer: Layer | null = null;
    let cancelled = false;

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled) return;
        const layer = new GoogleMutant({ type: "roadmap", maxZoom: 21 });
        googleLayer = layer;
        layer.addTo(map);
        map.invalidateSize();
        setGoogleReady(true);
      })
      .catch(() => setUseOsmOnly(true));

    return () => {
      cancelled = true;
      if (googleLayer) map.removeLayer(googleLayer);
    };
  }, [map, apiKey, useOsmOnly]);

  if (useOsmOnly || !googleReady) return <OsmBasemap />;
  return null;
}

export function GeoMapBasemap() {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return <OsmBasemap />;
  return <GoogleMutantBasemap apiKey={apiKey} />;
}
