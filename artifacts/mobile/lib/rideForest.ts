import type { GeoJSONFeatureCollection } from "./types";

const DEFAULT_RIDE_FOREST_BASE_URL = "https://scenders.com";
const CACHE_TTL_MS = 5 * 60 * 1000;

export type RideGuideTrackPoint = {
  lat: number;
  lng: number;
  ele?: number;
};

export type RideGuide = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  city: string | null;
  citySlug: string | null;
  state: string | null;
  stateSlug: string | null;
  lengthMiles: number | null;
  elevationFeet: number | null;
  difficulty: string | null;
  rating: number | null;
  thumbnailUrl: string | null;
  featuredImage: string | null;
  directions: string | null;
  features: string | string[] | null;
  sourceDescription: string | null;
  generatedDescription: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  tags: string[];
  trackCoordinates: RideGuideTrackPoint[];
  updatedAt: string | null;
};

export type RideGuideFilters = {
  difficulty: string | null;
  minimumRating: number | null;
  maximumDistanceMiles: number | null;
};

let rideGuideCache: { expiresAt: number; guides: RideGuide[] } | null = null;

function rideForestBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_RIDE_FOREST_BASE_URL?.trim() ||
    DEFAULT_RIDE_FOREST_BASE_URL
  ).replace(/\/+$/, "");
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result || null;
}

function identifierOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return stringOrNull(value);
}

function normalizeTrack(value: unknown): RideGuideTrackPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point): RideGuideTrackPoint[] => {
    if (!point || typeof point !== "object") return [];
    const source = point as Record<string, unknown>;
    const lat = Number(source.lat);
    const lng = Number(source.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return [];
    }
    const ele = numberOrNull(source.ele);
    return [{ lat, lng, ...(ele !== null ? { ele } : {}) }];
  });
}

function normalizeRideGuide(value: unknown): RideGuide | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = identifierOrNull(source.id);
  const slug = stringOrNull(source.slug);
  const title = stringOrNull(source.title);
  if (!id || !slug || !title) return null;

  return {
    id,
    slug,
    title,
    location: stringOrNull(source.location),
    city: stringOrNull(source.city),
    citySlug: stringOrNull(source.citySlug),
    state: stringOrNull(source.state),
    stateSlug: stringOrNull(source.stateSlug),
    lengthMiles: numberOrNull(source.lengthMiles),
    elevationFeet: numberOrNull(source.elevationFeet),
    difficulty: stringOrNull(source.difficulty),
    rating: numberOrNull(source.rating),
    thumbnailUrl: stringOrNull(source.thumbnailUrl),
    featuredImage: stringOrNull(source.featuredImage),
    directions: stringOrNull(source.directions),
    features:
      typeof source.features === "string" || Array.isArray(source.features)
        ? (source.features as string | string[])
        : null,
    sourceDescription: stringOrNull(source.sourceDescription),
    generatedDescription: stringOrNull(source.generatedDescription),
    seoTitle: stringOrNull(source.seoTitle),
    seoDescription: stringOrNull(source.seoDescription),
    tags: Array.isArray(source.tags)
      ? source.tags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
    trackCoordinates: normalizeTrack(source.trackCoordinates),
    updatedAt: stringOrNull(source.updatedAt),
  };
}

async function fetchJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${rideForestBaseUrl()}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Scenders ride library returned ${response.status}.`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The Scenders ride library took too long to respond.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listRideGuides(force = false): Promise<RideGuide[]> {
  if (!force && rideGuideCache && rideGuideCache.expiresAt > Date.now()) {
    return rideGuideCache.guides;
  }
  const payload = await fetchJson("/api/ride-guides");
  if (!Array.isArray(payload)) {
    throw new Error(
      "The Scenders ride library returned an unexpected response.",
    );
  }
  const guides = payload
    .map(normalizeRideGuide)
    .filter((guide): guide is RideGuide => Boolean(guide));
  rideGuideCache = { guides, expiresAt: Date.now() + CACHE_TTL_MS };
  return guides;
}

export async function getRideGuide(slug: string): Promise<RideGuide> {
  const payload = await fetchJson(
    `/api/ride-guides/${encodeURIComponent(slug)}`,
  );
  const guide = normalizeRideGuide(payload);
  if (!guide) {
    throw new Error("This ride guide is unavailable.");
  }
  return guide;
}

export function filterRideGuides(
  guides: RideGuide[],
  filters: RideGuideFilters,
): RideGuide[] {
  return guides.filter((guide) => {
    if (
      filters.difficulty &&
      guide.difficulty?.toLocaleLowerCase() !==
        filters.difficulty.toLocaleLowerCase()
    ) {
      return false;
    }
    if (
      filters.minimumRating !== null &&
      (guide.rating === null || guide.rating < filters.minimumRating)
    ) {
      return false;
    }
    if (
      filters.maximumDistanceMiles !== null &&
      (guide.lengthMiles === null ||
        guide.lengthMiles > filters.maximumDistanceMiles)
    ) {
      return false;
    }
    return true;
  });
}

export function rideGuideGeoJson(guide: RideGuide): GeoJSONFeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      guide.trackCoordinates.length >= 2
        ? [
            {
              type: "Feature",
              properties: {
                source: "rideforest",
                rideGuideId: guide.id,
                rideGuideSlug: guide.slug,
                difficulty: guide.difficulty,
                rating: guide.rating,
                distanceMiles: guide.lengthMiles,
              },
              geometry: {
                type: "LineString",
                coordinates: guide.trackCoordinates.map((point) =>
                  point.ele === undefined
                    ? [point.lng, point.lat]
                    : [point.lng, point.lat, point.ele],
                ),
              },
            },
          ]
        : [],
  };
}

export function rideGuideBounds(
  guide: RideGuide,
): [number, number, number, number] | undefined {
  if (guide.trackCoordinates.length < 2) return undefined;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const point of guide.trackCoordinates) {
    west = Math.min(west, point.lng);
    south = Math.min(south, point.lat);
    east = Math.max(east, point.lng);
    north = Math.max(north, point.lat);
  }
  return Number.isFinite(west) ? [west, south, east, north] : undefined;
}

export function rideGuideWebUrl(guide: RideGuide): string {
  const hierarchy = [guide.stateSlug, guide.citySlug, guide.slug]
    .filter(Boolean)
    .map((part) => encodeURIComponent(String(part)))
    .join("/");
  return `${rideForestBaseUrl()}/where-to-ride/${hierarchy || encodeURIComponent(guide.slug)}`;
}

export const SCENDERS_SHOP_URL =
  "https://scenders.com/shop?utm_source=advguides&utm_medium=affiliate&utm_campaign=gear_guides";
