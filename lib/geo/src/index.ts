import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * A named geographic region used to group community datasets. US datasets are
 * grouped by state; everything else is grouped by country.
 */
export type Region = {
  name: string;
  kind: "state" | "country";
};

type Ring = number[][];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];

type RegionFeature = {
  name: string;
  kind: "state" | "country";
  // Normalized to an array of polygons (each polygon = outer ring + holes).
  polygons: MultiPolygonCoords;
  // Precomputed bounding box [west, south, east, north] for fast rejection.
  bbox: [number, number, number, number];
};

type RawFeature = {
  properties?: { name?: string; kind?: "state" | "country" };
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
};

type RawCollection = { features?: RawFeature[] };

function bboxOf(polygons: MultiPolygonCoords): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer) continue;
    for (const pos of outer) {
      const lng = pos[0];
      const lat = pos[1];
      if (typeof lng !== "number" || typeof lat !== "number") continue;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return [west, south, east, north];
}

function loadFeatures(): RegionFeature[] {
  const path = fileURLToPath(new URL("./regions.json", import.meta.url));
  const raw = JSON.parse(readFileSync(path, "utf8")) as RawCollection;
  const features: RegionFeature[] = [];
  for (const f of raw.features ?? []) {
    const name = f.properties?.name;
    const kind = f.properties?.kind;
    const geom = f.geometry;
    if (!name || (kind !== "state" && kind !== "country") || !geom) continue;
    let polygons: MultiPolygonCoords;
    if (geom.type === "Polygon") {
      polygons = [geom.coordinates as PolygonCoords];
    } else if (geom.type === "MultiPolygon") {
      polygons = geom.coordinates as MultiPolygonCoords;
    } else {
      continue;
    }
    features.push({ name, kind, polygons, bbox: bboxOf(polygons) });
  }
  return features;
}

// Boundary polygons are loaded once at module init. The dataset is small
// (~340KB) and shared across all lookups.
const FEATURES: RegionFeature[] = loadFeatures();

// Name -> kind map so a stored region name can be classified without a
// coordinate. States win ties (a name is only ever one or the other here).
const KIND_BY_NAME: Map<string, "state" | "country"> = (() => {
  const m = new Map<string, "state" | "country">();
  for (const f of FEATURES) {
    if (!m.has(f.name) || f.kind === "state") m.set(f.name, f.kind);
  }
  return m;
})();

/**
 * Classify a stored region name as a US state or a country. Returns null for an
 * unknown name (e.g. a region label no longer present in the boundary set).
 */
export function regionKind(name: string): "state" | "country" | null {
  return KIND_BY_NAME.get(name) ?? null;
}

/**
 * Standard ray-casting test: is [lng, lat] inside this single ring? Counts how
 * many times a ray cast east from the point crosses ring edges.
 */
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const xi = a[0];
    const yi = a[1];
    const xj = b[0];
    const yj = b[1];
    if (
      typeof xi !== "number" ||
      typeof yi !== "number" ||
      typeof xj !== "number" ||
      typeof yj !== "number"
    ) {
      continue;
    }
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * A point is inside a GeoJSON polygon when it falls within the outer ring and
 * not within any hole (subsequent rings).
 */
function pointInPolygon(lng: number, lat: number, polygon: PolygonCoords): boolean {
  const outer = polygon[0];
  if (!outer || !pointInRing(lng, lat, outer)) return false;
  for (let r = 1; r < polygon.length; r++) {
    const hole = polygon[r];
    if (hole && pointInRing(lng, lat, hole)) return false;
  }
  return true;
}

/**
 * Resolve a coordinate to its named region. US states are checked before
 * countries so a point inside the US resolves to its state rather than to
 * "United States of America". Returns null when the point matches no boundary
 * (e.g. open ocean, or sparse coverage at this simplification level).
 */
/**
 * Return the precomputed bounding box [west, south, east, north] for a named
 * region, or null when the name is not in the boundary set. Useful for building
 * spatial queries (e.g. Overpass API) without recomputing from polygons.
 */
export function bboxForRegion(
  name: string,
): [number, number, number, number] | null {
  const feature = FEATURES.find((f) => f.name === name);
  return feature ? feature.bbox : null;
}

export function regionForPoint(lat: number, lng: number): Region | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // States first, then countries.
  for (const want of ["state", "country"] as const) {
    for (const feature of FEATURES) {
      if (feature.kind !== want) continue;
      const [w, s, e, n] = feature.bbox;
      if (lng < w || lng > e || lat < s || lat > n) continue;
      for (const polygon of feature.polygons) {
        if (pointInPolygon(lng, lat, polygon)) {
          return { name: feature.name, kind: feature.kind };
        }
      }
    }
  }
  return null;
}
