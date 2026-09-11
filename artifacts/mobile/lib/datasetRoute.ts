import { pathLengthMeters } from "@/lib/geo";
import type {
  Dataset,
  GeoJSONFeatureCollection,
  Track,
  TrackPoint,
} from "@/lib/types";

export type RoutePoint = { lat: number; lng: number; alt: number | null };

/**
 * Flatten a dataset's line geometries into a single ordered list of route
 * coordinates. Community datasets are typically a single route (LineString),
 * but multi-segment routes (MultiLineString, or several line features) are
 * concatenated in feature order. GeoJSON positions are [lng, lat, alt?]; the
 * optional third element is captured as altitude when present. Point and polygon
 * geometries are ignored — they can't be followed as a route.
 */
export function datasetRouteCoords(
  geojson: GeoJSONFeatureCollection,
): RoutePoint[] {
  const out: RoutePoint[] = [];
  const addPos = (pos: number[]) => {
    const lng = pos[0];
    const lat = pos[1];
    const alt = pos[2];
    if (typeof lat !== "number" || typeof lng !== "number") return;
    out.push({
      lat,
      lng,
      alt: typeof alt === "number" && Number.isFinite(alt) ? alt : null,
    });
  };
  for (const f of geojson.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString") {
      (g.coordinates as unknown as number[][]).forEach(addPos);
    } else if (g.type === "MultiLineString") {
      (g.coordinates as unknown as number[][][]).forEach((line) =>
        line.forEach(addPos),
      );
    }
  }
  return out;
}

/** Convert flattened route coordinates into TrackPoints. */
export function routePointsToTrackPoints(coords: RoutePoint[]): TrackPoint[] {
  const now = Date.now();
  return coords.map((c, i) => ({
    lat: c.lat,
    lng: c.lng,
    t: now + i,
    alt: c.alt,
    acc: null,
  }));
}

/**
 * Build an in-memory Track from a dataset so it can drive the existing
 * follow-mode UI. This synthetic track is never persisted or synced — it is set
 * directly as the active follow target.
 */
export function datasetToFollowTrack(
  dataset: Dataset,
  points: TrackPoint[],
): Track {
  const now = Date.now();
  return {
    id: `dataset:${dataset.id}`,
    name: dataset.name,
    color: dataset.color,
    kind: "plotted",
    distanceMeters: pathLengthMeters(points),
    durationMs: 0,
    pointCount: points.length,
    startedAt: now,
    endedAt: now,
    createdAt: now,
    points,
  };
}
