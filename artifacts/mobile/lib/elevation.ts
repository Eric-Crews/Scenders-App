import { haversineMeters } from "@/lib/geo";

function apiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "/api";
}

/**
 * Look up ground elevation (meters) for a list of coordinates via the API
 * server's elevation proxy. Returns one value per input point, or null where
 * elevation is unavailable. Resolves to all-null on any network failure so the
 * caller can degrade gracefully offline.
 */
const CHUNK_SIZE = 100;

async function fetchElevationChunk(
  points: { lat: number; lng: number }[],
): Promise<(number | null)[]> {
  try {
    const res = await fetch(`${apiBase()}/elevation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ points }),
    });
    if (!res.ok) return points.map(() => null);
    const data = (await res.json()) as { elevations?: unknown };
    const raw = Array.isArray(data.elevations) ? data.elevations : [];
    return points.map((_, i) => {
      const v = raw[i];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    });
  } catch {
    return points.map(() => null);
  }
}

export async function fetchElevations(
  points: { lat: number; lng: number }[],
): Promise<(number | null)[]> {
  if (points.length === 0) return [];
  // The proxy caps each request, so split long routes into chunks and merge.
  const out: (number | null)[] = [];
  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    const chunk = points.slice(i, i + CHUNK_SIZE);
    out.push(...(await fetchElevationChunk(chunk)));
  }
  return out;
}

/**
 * Total positive elevation change (gain) across an ordered list of altitudes.
 * Nulls are skipped — gain is only counted between consecutive known values.
 */
export function elevationGainMeters(alts: (number | null | undefined)[]): number {
  let gain = 0;
  let prev: number | null = null;
  for (const a of alts) {
    if (typeof a !== "number" || !Number.isFinite(a)) continue;
    if (prev !== null && a > prev) gain += a - prev;
    prev = a;
  }
  return gain;
}

export type ElevationStats = {
  /** Total positive elevation change. */
  gainMeters: number;
  /** Total negative elevation change (reported as a positive magnitude). */
  lossMeters: number;
  /** Lowest known altitude, or null when no elevation data is present. */
  minMeters: number | null;
  /** Highest known altitude, or null when no elevation data is present. */
  maxMeters: number | null;
  /** Number of points that carry a usable altitude. */
  sampleCount: number;
};

/**
 * Summarize an ordered list of altitudes into gain/loss/min/max. Nulls are
 * skipped so offline-plotted routes (which lack elevation) degrade to zeros and
 * a null min/max that callers can use to hide the chart.
 */
export function elevationStats(
  alts: (number | null | undefined)[],
): ElevationStats {
  let gain = 0;
  let loss = 0;
  let min: number | null = null;
  let max: number | null = null;
  let count = 0;
  let prev: number | null = null;
  for (const a of alts) {
    if (typeof a !== "number" || !Number.isFinite(a)) continue;
    count++;
    if (min === null || a < min) min = a;
    if (max === null || a > max) max = a;
    if (prev !== null) {
      if (a > prev) gain += a - prev;
      else if (a < prev) loss += prev - a;
    }
    prev = a;
  }
  return {
    gainMeters: gain,
    lossMeters: loss,
    minMeters: min,
    maxMeters: max,
    sampleCount: count,
  };
}

export type RemainingElevation = {
  /** Positive elevation change still ahead of the marker. */
  gainMeters: number;
  /** Negative elevation change still ahead (positive magnitude). */
  lossMeters: number;
  /** False when the route lacks two altitude-bearing points to measure. */
  hasData: boolean;
};

/**
 * Remaining elevation gain/loss from a projected position (cumulative distance
 * `markerDist` along the route) to the end. Builds the same distance-vs-altitude
 * samples the profile chart uses, interpolates the altitude at the marker, then
 * sums climb/descent across everything ahead of it. Degrades to `hasData: false`
 * when fewer than two points carry altitude. A null/undefined marker measures
 * the whole route from the start.
 */
export function remainingElevation(
  points: { lat: number; lng: number; alt?: number | null }[],
  markerDist: number | null | undefined,
): RemainingElevation {
  const samples: { dist: number; alt: number }[] = [];
  let cumulative = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      cumulative += haversineMeters(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
    }
    const alt = points[i].alt;
    if (typeof alt === "number" && Number.isFinite(alt)) {
      samples.push({ dist: cumulative, alt });
    }
  }
  if (samples.length < 2) {
    return { gainMeters: 0, lossMeters: 0, hasData: false };
  }

  const start =
    markerDist == null || !Number.isFinite(markerDist)
      ? 0
      : Math.max(0, markerDist);
  const last = samples[samples.length - 1];
  if (start >= last.dist) {
    // Past the final altitude sample — no climb left to report.
    return { gainMeters: 0, lossMeters: 0, hasData: true };
  }

  // Interpolate the altitude at the marker so a position mid-segment doesn't
  // skip the partial climb of the segment it sits on.
  let startAlt = last.alt;
  if (start <= samples[0].dist) {
    startAlt = samples[0].alt;
  } else {
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      if (start >= a.dist && start <= b.dist) {
        const range = b.dist - a.dist;
        const t = range > 0 ? (start - a.dist) / range : 0;
        startAlt = a.alt + (b.alt - a.alt) * t;
        break;
      }
    }
  }

  const ahead: number[] = [startAlt];
  for (const s of samples) {
    if (s.dist > start) ahead.push(s.alt);
  }

  let gain = 0;
  let loss = 0;
  let prev = ahead[0];
  for (let i = 1; i < ahead.length; i++) {
    const a = ahead[i];
    if (a > prev) gain += a - prev;
    else if (a < prev) loss += prev - a;
    prev = a;
  }
  return { gainMeters: gain, lossMeters: loss, hasData: true };
}

/**
 * Distance (meters) from a projected position (cumulative distance `markerDist`
 * along the route) to the next local elevation maximum ahead — the next high
 * point a follower will crest. Builds the same distance-vs-altitude samples as
 * `remainingElevation`, then walks forward from the marker to the first sample
 * that tops both neighbours (the final sample counts when the route ends mid
 * ascent). Returns null when the track lacks two altitude-bearing points or no
 * high point remains ahead. A null/undefined marker measures from the start.
 */
export function distanceToNextPeak(
  points: { lat: number; lng: number; alt?: number | null }[],
  markerDist: number | null | undefined,
): number | null {
  const samples: { dist: number; alt: number }[] = [];
  let cumulative = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      cumulative += haversineMeters(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
    }
    const alt = points[i].alt;
    if (typeof alt === "number" && Number.isFinite(alt)) {
      samples.push({ dist: cumulative, alt });
    }
  }
  if (samples.length < 2) return null;

  const start =
    markerDist == null || !Number.isFinite(markerDist)
      ? 0
      : Math.max(0, markerDist);

  for (let i = 0; i < samples.length; i++) {
    if (samples[i].dist <= start) continue;
    const prevAlt = i > 0 ? samples[i - 1].alt : -Infinity;
    const nextAlt = i < samples.length - 1 ? samples[i + 1].alt : -Infinity;
    if (samples[i].alt > prevAlt && samples[i].alt >= nextAlt) {
      return samples[i].dist - start;
    }
  }
  return null;
}

export type NextClimb = {
  /** Cumulative meters from route start where the climb's base sits. */
  startDist: number;
  /** Cumulative meters at the climb's summit. */
  endDist: number;
  /** Elevation gained from the base to the summit. */
  gainMeters: number;
  /** Route-following polyline from base to summit, for highlighting on a map. */
  path: { lat: number; lng: number }[];
};

// A climb must gain at least this much to count as "significant" — small enough
// to flag a real hill, large enough to ignore rolling-terrain noise.
const CLIMB_MIN_GAIN_METERS = 20;
// Shallow saddles up to this drop are absorbed into one climb so a single long
// ascent broken by a brief dip isn't split into two.
const CLIMB_DROP_TOLERANCE_METERS = 10;

type AltSample = { dist: number; alt: number; idx: number };

/**
 * Segment ordered altitude samples into ascent runs. Each climb spans from a
 * local base to its summit; a shallow dip (≤ drop tolerance) between two rises
 * is merged into a single climb. Returns sample-index ranges with their gain.
 */
function detectClimbs(
  samples: AltSample[],
): { start: number; peak: number; gain: number }[] {
  const climbs: { start: number; peak: number; gain: number }[] = [];
  const n = samples.length;
  let i = 0;
  while (i < n - 1) {
    if (samples[i + 1].alt <= samples[i].alt) {
      i++;
      continue;
    }
    const start = i;
    let peak = i + 1;
    let j = i + 1;
    while (j < n - 1) {
      if (samples[j + 1].alt >= samples[j].alt) {
        j++;
        if (samples[j].alt >= samples[peak].alt) peak = j;
      } else {
        // Descending — find the bottom of the dip, then decide whether it is a
        // shallow saddle (merge and keep climbing) or the real end of the climb.
        let k = j;
        while (k < n - 1 && samples[k + 1].alt < samples[k].alt) k++;
        const dip = samples[peak].alt - samples[k].alt;
        if (
          dip <= CLIMB_DROP_TOLERANCE_METERS &&
          k < n - 1 &&
          samples[k + 1].alt > samples[k].alt
        ) {
          j = k;
        } else {
          break;
        }
      }
    }
    const gain = samples[peak].alt - samples[start].alt;
    if (gain >= CLIMB_MIN_GAIN_METERS) {
      climbs.push({ start, peak, gain });
    }
    i = Math.max(peak, start + 1);
  }
  return climbs;
}

/** Interpolate a lat/lng on the route at a given cumulative distance. */
function interpAt(
  points: { lat: number; lng: number }[],
  cum: number[],
  d: number,
): { lat: number; lng: number } {
  const last = points.length - 1;
  if (d <= cum[0]) return { lat: points[0].lat, lng: points[0].lng };
  if (d >= cum[last]) return { lat: points[last].lat, lng: points[last].lng };
  for (let i = 0; i < last; i++) {
    if (d >= cum[i] && d <= cum[i + 1]) {
      const range = cum[i + 1] - cum[i];
      const t = range > 0 ? (d - cum[i]) / range : 0;
      return {
        lat: points[i].lat + (points[i + 1].lat - points[i].lat) * t,
        lng: points[i].lng + (points[i + 1].lng - points[i].lng) * t,
      };
    }
  }
  return { lat: points[last].lat, lng: points[last].lng };
}

/** Build the route-following polyline between two cumulative distances. */
function sliceRoute(
  points: { lat: number; lng: number }[],
  cum: number[],
  fromDist: number,
  toDist: number,
): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [interpAt(points, cum, fromDist)];
  for (let i = 0; i < points.length; i++) {
    if (cum[i] > fromDist && cum[i] < toDist) {
      out.push({ lat: points[i].lat, lng: points[i].lng });
    }
  }
  out.push(interpAt(points, cum, toDist));
  return out;
}

/**
 * Locate the next significant climb whose summit lies ahead of a projected
 * position (cumulative distance `markerDist` along the route). Returns the
 * climb's base/summit distances, its total gain, and a route-following polyline
 * to highlight on a map. The whole climb (base → summit) is returned, even when
 * the position is already part-way up it, so a follower can see where the effort
 * began and where it crests. Returns `null` when no climb ahead clears the
 * significance threshold or the route lacks altitude data. A null/undefined
 * marker measures from the route start.
 */
export function nextClimb(
  points: { lat: number; lng: number; alt?: number | null }[],
  markerDist: number | null | undefined,
): NextClimb | null {
  if (points.length < 2) return null;

  const cum: number[] = [];
  const samples: AltSample[] = [];
  let cumulative = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      cumulative += haversineMeters(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
    }
    cum.push(cumulative);
    const alt = points[i].alt;
    if (typeof alt === "number" && Number.isFinite(alt)) {
      samples.push({ dist: cumulative, alt, idx: i });
    }
  }
  if (samples.length < 2) return null;

  const from =
    markerDist == null || !Number.isFinite(markerDist)
      ? 0
      : Math.max(0, markerDist);

  const climbs = detectClimbs(samples);
  for (const c of climbs) {
    const summitDist = samples[c.peak].dist;
    // Only flag climbs whose summit is still ahead — once crested, move on.
    if (summitDist <= from) continue;
    const baseDist = samples[c.start].dist;
    return {
      startDist: baseDist,
      endDist: summitDist,
      gainMeters: c.gain,
      path: sliceRoute(points, cum, baseDist, summitDist),
    };
  }
  return null;
}
