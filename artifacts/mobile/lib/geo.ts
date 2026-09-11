export type LatLng = { lat: number; lng: number };

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function pathLengthMeters(points: LatLng[]): number {
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

/**
 * Project a point onto a segment using a local equirectangular approximation
 * (good enough for the short segments involved in route following). Returns the
 * projected position, the fraction `t` along the segment [0,1], and the
 * perpendicular distance in meters.
 */
function projectToSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng,
): { point: LatLng; t: number; distanceMeters: number } {
  const latRef = toRad((a.lat + b.lat) / 2);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRef);

  const ax = a.lng * mPerDegLng;
  const ay = a.lat * mPerDegLat;
  const bx = b.lng * mPerDegLng;
  const by = b.lat * mPerDegLat;
  const px = p.lng * mPerDegLng;
  const py = p.lat * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projLng = (ax + t * dx) / mPerDegLng;
  const projLat = (ay + t * dy) / mPerDegLat;
  const point = { lat: projLat, lng: projLng };
  return { point, t, distanceMeters: haversineMeters(p.lat, p.lng, projLat, projLng) };
}

export type RouteProgress = {
  /** Perpendicular distance from the current position to the route, in meters. */
  offRouteMeters: number;
  /** Remaining distance from the projected position to the end of the route. */
  distanceRemainingMeters: number;
  /** Index of the segment (start vertex) the position projects onto. */
  segmentIndex: number;
};

/**
 * Locate the current position against a route polyline: how far off-route it is
 * and how much distance remains to the end. Picks the nearest segment, then sums
 * the leftover distance from the projection point onward.
 */
export function routeProgress(
  route: LatLng[],
  current: LatLng,
): RouteProgress | null {
  if (route.length < 2) return null;

  let best = {
    off: Infinity,
    seg: 0,
    t: 0,
    proj: route[0],
  };
  for (let i = 0; i < route.length - 1; i++) {
    const r = projectToSegment(current, route[i], route[i + 1]);
    if (r.distanceMeters < best.off) {
      best = { off: r.distanceMeters, seg: i, t: r.t, proj: r.point };
    }
  }

  // Remaining = (proj -> end of current segment) + (subsequent full segments).
  let remaining = haversineMeters(
    best.proj.lat,
    best.proj.lng,
    route[best.seg + 1].lat,
    route[best.seg + 1].lng,
  );
  for (let i = best.seg + 1; i < route.length - 1; i++) {
    remaining += haversineMeters(
      route[i].lat,
      route[i].lng,
      route[i + 1].lat,
      route[i + 1].lng,
    );
  }

  return {
    offRouteMeters: best.off,
    distanceRemainingMeters: remaining,
    segmentIndex: best.seg,
  };
}
