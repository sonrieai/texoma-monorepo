interface Window {
  google?: {
    maps?: unknown;
  };
}

declare module "leaflet.gridlayer.googlemutant/src/Leaflet.GoogleMutant.mjs" {
  import { GridLayer } from "leaflet";

  export default class GoogleMutant extends GridLayer {
    constructor(options?: {
      type?: "roadmap" | "satellite" | "terrain" | "hybrid";
      maxZoom?: number;
      maxNativeZoom?: number;
    });
  }
}
