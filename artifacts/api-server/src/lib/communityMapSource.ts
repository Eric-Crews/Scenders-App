export const COMMUNITY_MAP_LABEL = "Community map";

const SUPPORTAL_MARKER = /\[supportal:[^\]]+\]/gi;
const SUPPORTAL_MARKER_TEST = /\[supportal:[^\]]+\]/i;
const SOURCE_REFERENCE =
  /\b(?:supportal|venture[\s-]*out|adventure\s+collective)\b(?:\s+(?:api|data(?:\s+source)?|trail(?:\s+source)?))?/gi;
const SOURCE_REFERENCE_TEST =
  /\b(?:supportal|venture[\s-]*out|adventure\s+collective)\b(?:\s+(?:api|data(?:\s+source)?|trail(?:\s+source)?))?/i;

type SourceMetadata = {
  description?: string | null;
  author?: string | null;
};

/**
 * Keeps the upstream import mechanism private from public community-map and
 * trail-guide surfaces. The original metadata stays in the database so the
 * importer can continue to deduplicate safely.
 */
export function isCommunityMapSource(metadata: SourceMetadata): boolean {
  return [metadata.description, metadata.author].some(
    (value) =>
      typeof value === "string" &&
      (SUPPORTAL_MARKER_TEST.test(value) || SOURCE_REFERENCE_TEST.test(value)),
  );
}

export function redactCommunityMapSourceText(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const redacted = value
    .replace(SUPPORTAL_MARKER, COMMUNITY_MAP_LABEL)
    .replace(SOURCE_REFERENCE, COMMUNITY_MAP_LABEL)
    .replace(/\s+/g, " ")
    .replace(/(?:community map)(?:\s+community map)+/gi, COMMUNITY_MAP_LABEL)
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  return redacted || null;
}

/**
 * Community imports may carry upstream URLs and labels in arbitrary feature
 * properties. Public pages need only display labels, notes, and kind, so when a
 * source is redacted, strip every other property before serializing GeoJSON.
 */
export function publicCommunityMapGeoJson(
  geojson: unknown,
  redactSource: boolean,
): unknown {
  if (!redactSource || !geojson || typeof geojson !== "object") return geojson;
  const collection = geojson as { features?: unknown[] };
  if (!Array.isArray(collection.features)) {
    return { type: "FeatureCollection", features: [] };
  }
  const allowedPropertyKeys = new Set(["name", "title", "description", "notes", "kind"]);
  const publicCoordinates = (value: unknown): unknown | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!Array.isArray(value)) return null;
    const items = value.map(publicCoordinates);
    return items.every((item) => item !== null) ? items : null;
  };
  const publicGeometry = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object") return null;
    const geometry = value as { type?: unknown; coordinates?: unknown; geometries?: unknown };
    if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
      return {
        type: "GeometryCollection",
        geometries: geometry.geometries
          .map(publicGeometry)
          .filter((item): item is Record<string, unknown> => item !== null),
      };
    }
    if (
      !["Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"]
        .includes(String(geometry.type))
    ) {
      return null;
    }
    const coordinates = publicCoordinates(geometry.coordinates);
    return coordinates === null ? null : { type: geometry.type, coordinates };
  };
  return {
    type: "FeatureCollection",
    features: collection.features.flatMap((feature) => {
      if (!feature || typeof feature !== "object") return [];
      const record = feature as { properties?: unknown; geometry?: unknown };
      const geometry = publicGeometry(record.geometry);
      if (!geometry) return [];
      const properties = Object.fromEntries(
        Object.entries(
          record.properties && typeof record.properties === "object"
            ? record.properties as Record<string, unknown>
            : {},
        )
          .filter(([key]) => allowedPropertyKeys.has(key))
          .map(([key, value]) =>
            typeof value === "string"
              ? [key, redactCommunityMapSourceText(value) ?? ""]
              : null,
          )
          .filter((item): item is [string, string] => item !== null),
      );
      return [{ type: "Feature", properties, geometry }];
    }),
  };
}

export function publicCommunityMapMetadata(metadata: SourceMetadata): {
  description: string | null;
  author: string | null;
  isCommunityMapSource: boolean;
} {
  const usesCommunityMapSource = isCommunityMapSource(metadata);
  if (!usesCommunityMapSource) {
    return {
      description: metadata.description ?? null,
      author: metadata.author ?? null,
      isCommunityMapSource: usesCommunityMapSource,
    };
  }

  return {
    description: redactCommunityMapSourceText(metadata.description),
    author: COMMUNITY_MAP_LABEL,
    isCommunityMapSource: usesCommunityMapSource,
  };
}