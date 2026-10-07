import type { GridLayer } from "leaflet";

declare module "leaflet.gridlayer.googlemutant" {
  export default class GoogleMutant extends GridLayer {
    constructor(options?: {
      type?: "roadmap" | "satellite" | "terrain" | "hybrid";
      maxZoom?: number;
      maxNativeZoom?: number;
    });
  }
}
