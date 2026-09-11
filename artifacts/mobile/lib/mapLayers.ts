export type BaseLayerId = "osm" | "topo" | "cyclosm" | "satellite";
export type OverlayLayerId =
  | "hillshade"
  | "hiking"
  | "cycling"
  | "mtb"
  | "riding"
  | "slopes";

export type LayerConfig = {
  id: string;
  label: string;
  description: string;
  urlTemplate: string;
  subdomains?: string[];
  attribution: string;
  maxZoom: number;
  /** Whether this is a transparent overlay vs a solid base layer. */
  overlay: boolean;
  /**
   * Optional render opacity. Defaults to 1 for bases and 0.85 for overlays.
   * Used to let terrain shading (hillshade) sit subtly over the base map.
   */
  opacity?: number;
};

export const BASE_LAYERS: Record<BaseLayerId, LayerConfig> = {
  osm: {
    id: "osm",
    label: "OpenStreetMap",
    description: "Standard street and trail map",
    urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
    overlay: false,
  },
  topo: {
    id: "topo",
    label: "OpenTopoMap",
    description: "Topographic with contour lines and trails",
    urlTemplate: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
    attribution: "© OpenTopoMap (CC-BY-SA), © OpenStreetMap",
    maxZoom: 17,
    overlay: false,
  },
  cyclosm: {
    id: "cyclosm",
    label: "CyclOSM",
    description: "Cycling-focused: gravel, MTB, and dirt roads",
    urlTemplate:
      "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
    attribution: "CyclOSM | © OpenStreetMap contributors",
    maxZoom: 19,
    overlay: false,
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    description: "Aerial & satellite imagery",
    urlTemplate:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    overlay: false,
  },
};

export const OVERLAY_LAYERS: Record<OverlayLayerId, LayerConfig> = {
  hillshade: {
    id: "hillshade",
    label: "Hillshade",
    description: "Terrain relief shading for a sense of depth",
    urlTemplate:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
    attribution: "Hillshade © Esri — Source: USGS, Esri",
    maxZoom: 16,
    overlay: true,
    opacity: 0.45,
  },
  hiking: {
    id: "hiking",
    label: "Hiking trails",
    description: "Marked hiking & walking routes",
    urlTemplate:
      "https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png",
    attribution: "Waymarked Trails – Hiking",
    maxZoom: 18,
    overlay: true,
  },
  cycling: {
    id: "cycling",
    label: "Cycling routes",
    description: "Road, gravel, and touring cycle routes",
    urlTemplate:
      "https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png",
    attribution: "Waymarked Trails – Cycling",
    maxZoom: 18,
    overlay: true,
  },
  mtb: {
    id: "mtb",
    label: "Mountain biking",
    description: "MTB routes and singletrack",
    urlTemplate: "https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png",
    attribution: "Waymarked Trails – MTB",
    maxZoom: 18,
    overlay: true,
  },
  riding: {
    id: "riding",
    label: "Horse routes",
    description: "Equestrian and bridle trails",
    urlTemplate:
      "https://tile.waymarkedtrails.org/riding/{z}/{x}/{y}.png",
    attribution: "Waymarked Trails – Riding",
    maxZoom: 18,
    overlay: true,
  },
  slopes: {
    id: "slopes",
    label: "Ski slopes",
    description: "Ski runs, lifts, and winter routes",
    urlTemplate:
      "https://tile.waymarkedtrails.org/slopes/{z}/{x}/{y}.png",
    attribution: "Waymarked Trails – Slopes",
    maxZoom: 18,
    overlay: true,
  },
};

export const ALL_LAYERS: Record<string, LayerConfig> = {
  ...BASE_LAYERS,
  ...OVERLAY_LAYERS,
};

export const BASE_LAYER_IDS = Object.keys(BASE_LAYERS) as BaseLayerId[];
export const OVERLAY_LAYER_IDS = Object.keys(OVERLAY_LAYERS) as OverlayLayerId[];

export const DEFAULT_BASE_LAYER: BaseLayerId = "topo";
export const DEFAULT_OVERLAYS: OverlayLayerId[] = [];

export function getLayer(id: string): LayerConfig | undefined {
  return ALL_LAYERS[id];
}

export function resolveTileUrl(
  config: LayerConfig,
  z: number,
  x: number,
  y: number,
): string {
  const sub =
    config.subdomains && config.subdomains.length > 0
      ? config.subdomains[(x + y) % config.subdomains.length]
      : "";
  return config.urlTemplate
    .replace("{s}", sub)
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}
