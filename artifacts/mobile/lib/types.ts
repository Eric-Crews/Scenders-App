export type Dataset = {
  id: string;
  name: string;
  format: "geojson" | "kml" | "gpx" | "kmz";
  geojson: GeoJSONFeatureCollection;
  color: string;
  visible: boolean;
  importedAt: number;
  bounds?: [number, number, number, number];
  /** When this dataset originated from the community library, the source id. */
  communityId?: string;
  /** Community dataset category. trail = Supportal/Adventure Collective, road = Overpass overlanding. */
  communityKind?: "trail" | "road";
};

export type Waypoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  notes?: string;
  createdAt: number;
  /** Linked track id when this waypoint was dropped during a recording. */
  trackId?: string;
  /** Local-only file URI for an attached photo. Not synced to cloud. */
  photoUri?: string;
  /** Durable cloud photo URL used only when a private project is prepared. */
  photoUrl?: string;
};

export type TrackPoint = {
  lat: number;
  lng: number;
  /** Timestamp in ms since epoch. */
  t: number;
  alt?: number | null;
  /** Horizontal accuracy in meters. */
  acc?: number | null;
};

export type TrackSummary = {
  id: string;
  name: string;
  /** Optional free-text notes, primarily for plotted routes. */
  description?: string | null;
  color: string;
  distanceMeters: number;
  durationMs: number;
  pointCount: number;
  startedAt: number;
  endedAt: number;
  createdAt: number;
  /** How the track was created. Defaults to "recorded" for legacy tracks. */
  kind?: "recorded" | "plotted";
  /** Community dataset id once this track has been published to the library. */
  publishedDatasetId?: string;
  /** Unguessable token for the public share link, null/undefined when unshared. */
  shareToken?: string | null;
  /** Link visibility: "private" (link only) or "public" (link + community). */
  shareVisibility?: "private" | "public" | null;
};

export type Track = TrackSummary & {
  points: TrackPoint[];
};

export type OfflineRegion = {
  id: string;
  name: string;
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  createdAt: number;
};

export type GeoJSONPosition = [number, number] | [number, number, number];

export type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: GeoJSONPosition[] }
  | { type: "Polygon"; coordinates: [number, number][][] }
  | { type: "MultiPoint"; coordinates: GeoJSONPosition[] }
  | { type: "MultiLineString"; coordinates: GeoJSONPosition[][] }
  | { type: "MultiPolygon"; coordinates: [number, number][][][] };

export type GeoJSONFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: GeoJSONGeometry | null;
};

export type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

export const DATASET_COLORS = [
  "#d2691e",
  "#4f7d57",
  "#3a6ec8",
  "#9b3ac8",
  "#c83a8e",
  "#d4a017",
  "#1f8a8a",
  "#8a4a1f",
];

/** Color palette for overlanding road datasets — amber/earth tones distinct from trail greens/blues. */
export const ROAD_COLORS = [
  "#d2691e",
  "#b06020",
  "#c8a030",
  "#9a6010",
  "#d4882a",
];

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
