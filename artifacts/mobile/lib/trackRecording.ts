import * as Location from "expo-location";

import type { GeoJSONFeatureCollection, Track, TrackPoint } from "./types";

export type RecordingHandle = {
  stop: () => Promise<TrackPoint[]>;
};

/**
 * Start a foreground GPS track recording. Returns an opaque handle whose
 * `stop()` resolves the accumulated points.
 *
 * The caller is responsible for keeping `onPoint` quick — it runs on every
 * location update from the OS (typically every 1–5 seconds depending on the
 * platform's accuracy bucketing).
 */
export async function startRecording(opts: {
  onPoint: (p: TrackPoint) => void;
}): Promise<RecordingHandle> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error(
      "Location permission denied — enable location access to record tracks.",
    );
  }

  const points: TrackPoint[] = [];
  const sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2000,
      distanceInterval: 5,
    },
    (loc) => {
      const p: TrackPoint = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        t: loc.timestamp || Date.now(),
        alt: loc.coords.altitude ?? null,
        acc: loc.coords.accuracy ?? null,
      };
      points.push(p);
      opts.onPoint(p);
    },
  );

  return {
    stop: async () => {
      sub.remove();
      return points;
    },
  };
}

export function trackDistanceMeters(points: TrackPoint[]): number {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversineMeters(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
  }
  return dist;
}

export function trackDurationMs(points: TrackPoint[]): number {
  if (points.length < 2) return 0;
  return Math.max(0, points[points.length - 1].t - points[0].t);
}

export function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Convert a recorded track into a single-LineString GeoJSON FeatureCollection,
 * suitable for publishing through the community datasets pipeline. Coordinates
 * are emitted in GeoJSON order ([lng, lat]).
 */
export function trackToFeatureCollection(track: Track): GeoJSONFeatureCollection {
  const coordinates = track.points.map(
    (p) => [p.lng, p.lat] as [number, number],
  );
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {
          name: track.name,
          distanceMeters: track.distanceMeters,
          durationMs: track.durationMs,
          pointCount: track.pointCount,
          startedAt: new Date(track.startedAt).toISOString(),
          endedAt: new Date(track.endedAt).toISOString(),
          color: track.color,
          source: "mapper.one/track",
        },
      },
    ],
  };
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
