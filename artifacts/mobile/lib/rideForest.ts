import type { GeoJSONFeatureCollection } from "./types";

const DEFAULT_RIDE_FOREST_BASE_URL = "https://scenders.com";

export type RideGuideTrackPoint = {
  lat: number;
  lng: number;
  ele?: number;
};

export type RideGuideContent = {
  magazineTitle: string | null;
  introduction: string | null;
  sections: Array<{ heading: string | null; content: string }>;
  faq: Array<{ question: string; answer: string }>;
  sidebarBoxes: Array<{
    type: string | null;
    title: string;
    content: string | null;
    items: string[];
  }>;
  conclusion: string | null;
  relatedTopics: string[];
  caveats: string[];
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
  lat: number | null;
  lng: number | null;
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
  content: RideGuideContent | null;
  seoTitle: string | null;
  seoDescription: string | null;
  tags: string[];
  trackCoordinates: RideGuideTrackPoint[];
  /** Distance from the requested origin, supplied by the catalog API. */
  distanceMiles: number | null;
  updatedAt: string | null;
};

export type RideGuideFilters = {
  difficulty: string | null;
  minimumRating: number | null;
  maximumDistanceMiles: number | null;
};

export type RideGuidePageParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  difficulty?: string | null;
  minRating?: number | null;
  length?: "short" | "medium" | "long" | null;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  sort?: "rating" | "nearest" | "length" | "elevation" | "title" | "updated";
};

export type RideGuidePage = {
  items: RideGuide[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  facets: {
    difficulties: string[];
    locations: Array<{
      state: string | null;
      stateSlug: string | null;
      city: string | null;
      citySlug: string | null;
    }>;
  };
};

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

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(stringOrNull)
    .filter((item): item is string => item !== null);
}

export function normalizeTrack(value: unknown): RideGuideTrackPoint[] {
  const geojson = recordOrNull(value);
  let segments: unknown[][];
  if (geojson?.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    segments = geojson.features.flatMap((feature) => {
      const geometry = recordOrNull(recordOrNull(feature)?.geometry);
      if (geometry?.type === "LineString" && Array.isArray(geometry.coordinates)) {
        return [geometry.coordinates];
      }
      if (geometry?.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
        return geometry.coordinates.filter((line): line is unknown[] => Array.isArray(line));
      }
      return [];
    });
  } else if (geojson?.type === "LineString" && Array.isArray(geojson.coordinates)) {
    segments = [geojson.coordinates];
  } else if (geojson?.type === "MultiLineString" && Array.isArray(geojson.coordinates)) {
    segments = geojson.coordinates.filter((line): line is unknown[] => Array.isArray(line));
  } else {
    segments = Array.isArray(value) ? [value] : [];
  }
  const normalized = segments.map((points) =>
    points.flatMap((point): RideGuideTrackPoint[] => {
      const source = recordOrNull(point);
      const tuple = Array.isArray(point) ? point : null;
      // GeoJSON tracks are [longitude, latitude, elevation], while the
      // app's internal representation is deliberately lat/lng based.
      const lat = Number(tuple ? tuple[1] : source?.lat);
      const lng = Number(tuple ? tuple[0] : source?.lng);
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
      const ele = numberOrNull(tuple ? tuple[2] : source?.ele);
      return [{ lat, lng, ...(ele !== null ? { ele } : {}) }];
    }),
  );
  const distance = (points: RideGuideTrackPoint[]) =>
    points.slice(1).reduce((total, point, index) => {
      const previous = points[index];
      const lat1 = previous.lat * Math.PI / 180;
      const lat2 = point.lat * Math.PI / 180;
      const dLat = lat2 - lat1;
      const dLng = (point.lng - previous.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return total + 2 * 6371000 * Math.asin(Math.sqrt(a));
    }, 0);
  return normalized
    .filter((points) => points.length >= 2)
    .sort((a, b) => distance(b) - distance(a))[0] ?? [];
}

function normalizeContent(value: unknown): RideGuideContent | null {
  const source = recordOrNull(value);
  if (!source) return null;
  const sections = Array.isArray(source.sections)
    ? source.sections.flatMap(
        (value): RideGuideContent["sections"] => {
          const section = recordOrNull(value);
          if (!section) return [];
          const content =
            stringOrNull(section.content) ||
            stringOrNull(section.body) ||
            stringOrNull(section.text);
          if (!content) return [];
          return [{ heading: stringOrNull(section.heading), content }];
        },
      )
    : [];
  const caveats = Array.isArray(source.caveats)
    ? textList(source.caveats)
    : [];
  const faq = Array.isArray(source.faq)
    ? source.faq.flatMap((value): RideGuideContent["faq"] => {
        const item = recordOrNull(value);
        if (!item) return [];
        const question = stringOrNull(item.question);
        const answer = stringOrNull(item.answer);
        return question && answer ? [{ question, answer }] : [];
      })
    : [];
  const sidebarBoxes = Array.isArray(source.sidebarBoxes)
    ? source.sidebarBoxes.flatMap((value): RideGuideContent["sidebarBoxes"] => {
        const box = recordOrNull(value);
        const title = stringOrNull(box?.title);
        if (!title) return [];
        return [
          {
            type: stringOrNull(box?.type),
            title,
            content: stringOrNull(box?.content),
            items: textList(box?.items),
          },
        ];
      })
    : [];
  const content: RideGuideContent = {
    magazineTitle: stringOrNull(source.magazineTitle),
    introduction: stringOrNull(source.introduction),
    sections,
    faq,
    sidebarBoxes,
    conclusion: stringOrNull(source.conclusion),
    relatedTopics: textList(source.relatedTopics),
    caveats,
  };
  return Object.values(content).some((item) =>
    Array.isArray(item) ? item.length > 0 : item !== null,
  )
    ? content
    : null;
}

export function normalizeRideGuide(value: unknown): RideGuide | null {
  const source = recordOrNull(value);
  if (!source) return null;
  const id = identifierOrNull(source.id);
  const slug = stringOrNull(source.slug);
  const title = stringOrNull(source.title);
  if (!id || !slug || !title) return null;

  const track = recordOrNull(source.track);

  const trackCandidates = [
    source.trackCoordinates,
    source.gpxCoordinates,
    track?.coordinates,
  ];
  const trackCoordinates =
    trackCandidates
      .map(normalizeTrack)
      .find((candidate) => candidate.length >= 2) ?? [];

  return {
    id,
    slug,
    title,
    location: stringOrNull(source.location),
    city: stringOrNull(source.city),
    citySlug: stringOrNull(source.citySlug),
    state: stringOrNull(source.state),
    stateSlug: stringOrNull(source.stateSlug),
    lat: numberOrNull(source.lat),
    lng: numberOrNull(source.lng),
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
    content: normalizeContent(source.content),
    seoTitle: stringOrNull(source.seoTitle),
    seoDescription: stringOrNull(source.seoDescription),
    tags: textList(source.tags),
    trackCoordinates,
    distanceMiles: numberOrNull(source.distanceMiles),
    updatedAt: stringOrNull(source.updatedAt),
  };
}

async function fetchJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
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

export async function listRideGuides(
  params: RideGuidePageParams = {},
): Promise<RideGuidePage> {
  const qs = new URLSearchParams();
  qs.set("page", String(Math.max(1, Math.floor(params.page ?? 1))));
  qs.set("pageSize", String(Math.min(48, Math.max(1, Math.floor(params.pageSize ?? 24)))));
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.difficulty?.trim()) qs.set("difficulty", params.difficulty.trim());
  if (params.minRating != null) qs.set("minRating", String(params.minRating));
  if (params.length) qs.set("length", params.length);
  const hasLocation = params.lat != null && params.lng != null;
  if (hasLocation) {
    qs.set("lat", String(params.lat));
    qs.set("lng", String(params.lng));
    if (params.radiusMiles != null) {
      qs.set("radiusMiles", String(params.radiusMiles));
    }
  }
  if (params.sort) qs.set("sort", params.sort);
  const payload = await fetchJson(`/api/ride-guides?${qs.toString()}`);
  const source = recordOrNull(payload);
  if (!source || !Array.isArray(source.items)) {
    throw new Error(
      "The Scenders ride library returned an unexpected response.",
    );
  }
  const items = source.items
    .map(normalizeRideGuide)
    .filter((guide): guide is RideGuide => Boolean(guide));
  const facets = recordOrNull(source.facets);
  return {
    items,
    total: numberOrNull(source.total) ?? 0,
    page: numberOrNull(source.page) ?? params.page ?? 1,
    pageSize: numberOrNull(source.pageSize) ?? params.pageSize ?? 24,
    hasMore: source.hasMore === true,
    facets: {
      difficulties: facets && Array.isArray(facets.difficulties)
        ? textList(facets.difficulties)
        : [],
      locations: facets && Array.isArray(facets.locations)
        ? facets.locations.flatMap((value) => {
            const location = recordOrNull(value);
            if (!location) return [];
            return [{
              state: stringOrNull(location.state),
              stateSlug: stringOrNull(location.stateSlug),
              city: stringOrNull(location.city),
              citySlug: stringOrNull(location.citySlug),
            }];
          })
        : [],
    },
  };
}

export async function listHomeRideGuides(location?: {
  latitude: number;
  longitude: number;
} | null): Promise<RideGuide[]> {
  const query = location
    ? `?lat=${encodeURIComponent(location.latitude)}&lng=${encodeURIComponent(location.longitude)}`
    : "";
  const payload = await fetchJson(`/api/ride-guides-home${query}`);
  if (!Array.isArray(payload)) {
    throw new Error("The featured ride service returned an unexpected response.");
  }
  return payload
    .map(normalizeRideGuide)
    .filter((guide): guide is RideGuide => Boolean(guide));
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

// Distance calculation helpers (Haversine formula)
const EARTH_RADIUS_MILES = 3958.8;

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

export function getDistanceToGuideMiles(
  userLat: number,
  userLon: number,
  guide: RideGuide
): number | null {
  if (guide.lat !== null && guide.lng !== null) {
    return calculateDistanceMiles(userLat, userLon, guide.lat, guide.lng);
  }
  if (guide.trackCoordinates.length === 0) {
    return null;
  }
  // Find the minimum distance to any point on the track
  // For performance, we could sample or just check all points. Most tracks have < 1000 points.
  let minDistance = Infinity;
  // Step through points (can jump to speed up if too many, but native JS should handle a few thousand iterations instantly)
  const step = Math.max(1, Math.floor(guide.trackCoordinates.length / 100));
  for (let i = 0; i < guide.trackCoordinates.length; i += step) {
    const pt = guide.trackCoordinates[i];
    const dist = calculateDistanceMiles(userLat, userLon, pt.lat, pt.lng);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  // Also check first and last point to be sure
  const lastPt = guide.trackCoordinates[guide.trackCoordinates.length - 1];
  if (lastPt) {
    const dist = calculateDistanceMiles(userLat, userLon, lastPt.lat, lastPt.lng);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance === Infinity ? null : minDistance;
}

export const SCENDERS_SHOP_URL =
  "https://scenders.com/shop?utm_source=advguides&utm_medium=affiliate&utm_campaign=gear_guides";
