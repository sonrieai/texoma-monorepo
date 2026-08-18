import "leaflet";

declare module "leaflet" {
  function heatLayer(
    latlngs: [number, number, number?][],
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: Record<number, string>;
    },
  ): Layer;
}

declare module "leaflet.heat" {
  const plugin: unknown;
  export default plugin;
}
