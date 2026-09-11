import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  COMMUNITY_MAP_LABEL,
  publicCommunityMapGeoJson,
  publicCommunityMapMetadata,
  redactCommunityMapSourceText,
} from "../lib/communityMapSource";
import { DOMParser } from "@xmldom/xmldom";
import toGeoJSON from "@mapbox/togeojson";
import { db, communityDatasetsTable, syncCompletionsTable } from "@workspace/db";
import { regionForPoint, regionKind, bboxForRegion } from "@workspace/geo";
import {
  BulkCreateCommunityDatasetsBody,
  BulkCreateCommunityDatasetsResponse,
  CreateCommunityDatasetBody,
  GetCommunityDatasetParams,
  GetCommunityDatasetResponse,
  GetSupportalStatusResponse,
  ListCommunityDatasetsQueryParams,
  ListCommunityDatasetsResponse,
  ListCommunityDatasetsResponseItem,
  ListCommunityRegionsResponse,
  SyncSupportalResponse,
  GetOverpassStatusResponse,
  SyncOverpassResponse,
  SyncOverpassBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

type RoutePoint = { lat: number; lng: number; alt: number | null };

/**
 * Collect a dataset's line geometries as separate, independent parts: each
 * LineString and each member of a MultiLineString is its own ordered coordinate
 * list. Distance/elevation must be summed within a part only — never across part
 * or feature boundaries — otherwise disconnected segments add phantom "bridge"
 * jumps. GeoJSON positions are [lng, lat, alt?]; point/polygon geometries are
 * ignored because they aren't a traversable route.
 */
function datasetLineParts(geojson: unknown): RoutePoint[][] {
  const toPart = (positions: unknown[]): RoutePoint[] => {
    const part: RoutePoint[] = [];
    for (const pos of positions) {
      if (!Array.isArray(pos)) continue;
      const lng = pos[0];
      const lat = pos[1];
      const alt = pos[2];
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      part.push({
        lat,
        lng,
        alt: typeof alt === "number" && Number.isFinite(alt) ? alt : null,
      });
    }
    return part;
  };
  const parts: RoutePoint[][] = [];
  const fc = geojson as { features?: unknown };
  const features = Array.isArray(fc?.features) ? fc.features : [];
  for (const f of features) {
    const g = (f as { geometry?: { type?: unknown; coordinates?: unknown } })
      ?.geometry;
    if (!g) continue;
    if (g.type === "LineString" && Array.isArray(g.coordinates)) {
      parts.push(toPart(g.coordinates as unknown[]));
    } else if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
      for (const line of g.coordinates as unknown[]) {
        if (Array.isArray(line)) parts.push(toPart(line));
      }
    }
  }
  return parts;
}

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Derive total distance and positive elevation gain from a dataset's route,
 * summing within each independent line part so disconnected segments never add
 * phantom bridge distance. `distanceMeters` is null only when the dataset has no
 * line geometry at all (a real but zero-length route reports 0);
 * `elevationGainMeters` is null when the route carries no altitude data.
 */
function routeStats(geojson: unknown): {
  distanceMeters: number | null;
  elevationGainMeters: number | null;
} {
  const parts = datasetLineParts(geojson);
  let hasRoute = false;
  let distance = 0;
  let gain = 0;
  let hasAlt = false;
  for (const part of parts) {
    if (part.length < 2) continue;
    hasRoute = true;
    for (let i = 1; i < part.length; i++) {
      const a = part[i - 1];
      const b = part[i];
      if (!a || !b) continue;
      distance += haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (a.alt !== null && b.alt !== null) {
        hasAlt = true;
        const delta = b.alt - a.alt;
        if (delta > 0) gain += delta;
      }
    }
  }
  return {
    distanceMeters: hasRoute ? distance : null,
    elevationGainMeters: hasAlt ? gain : null,
  };
}

/**
 * Resolve a dataset's named region (US state or country) from its bounding-box
 * centroid. Returns null when bounds are unknown or no boundary matched.
 */
function regionFromBounds(
  west: number | null,
  south: number | null,
  east: number | null,
  north: number | null,
): string | null {
  if (
    typeof west !== "number" ||
    typeof south !== "number" ||
    typeof east !== "number" ||
    typeof north !== "number"
  ) {
    return null;
  }
  const centerLat = (north + south) / 2;
  const centerLng = (east + west) / 2;
  return regionForPoint(centerLat, centerLng)?.name ?? null;
}

const SUMMARY_COLUMNS = {
  id: communityDatasetsTable.id,
  name: communityDatasetsTable.name,
  description: communityDatasetsTable.description,
  format: communityDatasetsTable.format,
  author: communityDatasetsTable.author,
  featureCount: communityDatasetsTable.featureCount,
  boundsWest: communityDatasetsTable.boundsWest,
  boundsSouth: communityDatasetsTable.boundsSouth,
  boundsEast: communityDatasetsTable.boundsEast,
  boundsNorth: communityDatasetsTable.boundsNorth,
  sizeBytes: communityDatasetsTable.sizeBytes,
  region: communityDatasetsTable.region,
  downloadCount: communityDatasetsTable.downloadCount,
  distanceMeters: communityDatasetsTable.distanceMeters,
  elevationGainMeters: communityDatasetsTable.elevationGainMeters,
  kind: communityDatasetsTable.kind,
  createdAt: communityDatasetsTable.createdAt,
};

function publicCommunityDataset<
  T extends { name: string; description: string | null; author: string | null; geojson?: unknown },
>(dataset: T): T {
  const metadata = publicCommunityMapMetadata(dataset);
  const isRedactedSource = metadata.isCommunityMapSource;
  return {
    ...dataset,
    name: isRedactedSource
      ? redactCommunityMapSourceText(dataset.name) ?? COMMUNITY_MAP_LABEL
      : dataset.name,
    description: metadata.description,
    author: metadata.author,
    ...("geojson" in dataset
      ? { geojson: publicCommunityMapGeoJson(dataset.geojson, isRedactedSource) }
      : {}),
  };
}

/** Thrown by `insertCommunityDataset` for user-facing payload problems (bad
 * GeoJSON, oversized payload) so callers can surface the message instead of a
 * generic 500. Unexpected failures bubble up as ordinary errors. */
class DatasetValidationError extends Error {}

type InsertDatasetInput = {
  name: string;
  description?: string | null;
  format: string;
  author?: string | null;
  geojson: unknown;
  kind?: string | null;
  maxSizeBytes?: number;
};

/**
 * Validate a single dataset payload, derive its bounding box / size / route
 * stats, insert it, and return the parsed summary row. Shared by the bulk
 * upload handler and the Supportal importer so both compute identical metadata.
 * Throws `DatasetValidationError` for bad input; other errors are unexpected.
 */
async function insertCommunityDataset(
  item: InsertDatasetInput,
): Promise<unknown> {
  const { name, description, format, author, geojson, kind, maxSizeBytes } = item;

  const fc = geojson as { type?: unknown; features?: unknown };
  if (
    fc.type !== "FeatureCollection" ||
    !Array.isArray(fc.features) ||
    fc.features.length === 0
  ) {
    throw new DatasetValidationError(
      "geojson must be a non-empty FeatureCollection",
    );
  }
  const features = fc.features as unknown[];
  const featureCount = features.length;

  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  const visitCoords = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") {
      const lng = c[0];
      const lat = c[1];
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    } else {
      for (const sub of c) visitCoords(sub);
    }
  };
  const visitGeom = (g: unknown): void => {
    if (!g || typeof g !== "object") return;
    const geom = g as {
      type?: unknown;
      coordinates?: unknown;
      geometries?: unknown;
    };
    if (geom.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
      for (const sub of geom.geometries) visitGeom(sub);
    } else if (geom.coordinates !== undefined) {
      visitCoords(geom.coordinates);
    }
  };
  for (const f of features) {
    if (f && typeof f === "object")
      visitGeom((f as { geometry?: unknown }).geometry);
  }
  const hasBounds = Number.isFinite(west) && Number.isFinite(south);

  const serialized = JSON.stringify(geojson);
  const sizeBytes = Buffer.byteLength(serialized, "utf8");
  const sizeLimit = maxSizeBytes ?? 8 * 1024 * 1024;
  if (sizeBytes > sizeLimit) {
    throw new DatasetValidationError(
      `geojson payload exceeds ${Math.round(sizeLimit / (1024 * 1024))}MB limit`,
    );
  }

  const stats = routeStats(geojson);
  const [row] = await db
    .insert(communityDatasetsTable)
    .values({
      name,
      description: description ?? null,
      format,
      author: author ?? null,
      geojson,
      featureCount,
      sizeBytes,
      boundsWest: hasBounds ? west : null,
      boundsSouth: hasBounds ? south : null,
      boundsEast: hasBounds ? east : null,
      boundsNorth: hasBounds ? north : null,
      region: hasBounds ? regionFromBounds(west, south, east, north) : null,
      kind: kind ?? null,
      distanceMeters: stats.distanceMeters,
      elevationGainMeters: stats.elevationGainMeters,
    })
    .returning(SUMMARY_COLUMNS);

  return ListCommunityDatasetsResponseItem.parse(publicCommunityDataset(row));
}

router.get("/community/datasets", async (req, res): Promise<void> => {
  const parsed = ListCommunityDatasetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid list query");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { lat, lng, q, region } = parsed.data;
  const regionTerm = region?.trim();
  // zod coerces limit to a number (not necessarily an integer); a fractional
  // LIMIT would error in Postgres, so floor it before use. The 5000 cap only
  // applies to region-scoped fetches (download-a-whole-region); otherwise 200.
  const cap = regionTerm ? 5000 : 200;
  const limit = Math.min(Math.max(1, Math.trunc(parsed.data.limit)), cap);
  req.log.info({ lat, lng, q, region: regionTerm, limit }, "Listing community datasets");

  const term = q?.trim();
  const searchWhere = term
    ? or(
        ilike(communityDatasetsTable.name, `%${term}%`),
        ilike(communityDatasetsTable.description, `%${term}%`),
        ilike(communityDatasetsTable.author, `%${term}%`),
      )
    : undefined;
  // Exact region match (region names are stored verbatim from the boundary set).
  const regionWhere = regionTerm
    ? eq(communityDatasetsTable.region, regionTerm)
    : undefined;
  const conditions = [searchWhere, regionWhere].filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );

  let qb = db.select(SUMMARY_COLUMNS).from(communityDatasetsTable).$dynamic();
  if (conditions.length === 1) qb = qb.where(conditions[0]);
  else if (conditions.length > 1) qb = qb.where(and(...conditions));

  if (typeof lat === "number" && typeof lng === "number") {
    // Nearest-first ranking on each dataset's bounding-box centroid. We use a
    // cheap planar metric (longitude scaled by cos(latitude) so a degree of
    // lng is comparable to a degree of lat) — exact great-circle distance is
    // unnecessary just to pick the closest results. Datasets without bounds
    // have a NULL centroid and sort last.
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const centerLat = sql`((${communityDatasetsTable.boundsNorth} + ${communityDatasetsTable.boundsSouth}) / 2.0)`;
    const centerLng = sql`((${communityDatasetsTable.boundsEast} + ${communityDatasetsTable.boundsWest}) / 2.0)`;
    const distSq = sql`(power(${centerLat} - ${lat}, 2) + power((${centerLng} - ${lng}) * ${cosLat}, 2))`;
    qb = qb.orderBy(sql`${distSq} ASC NULLS LAST`);
  } else {
    qb = qb.orderBy(desc(communityDatasetsTable.createdAt));
  }

  const rows = await qb.limit(limit);
  res.json(
    ListCommunityDatasetsResponse.parse(rows.map(publicCommunityDataset)),
  );
});

/**
 * GET /community/regions
 *
 * Aggregate published datasets by their named region (US state or country) so
 * the client can offer a "download a whole region" browse view. Datasets with
 * no resolved region are omitted. Ordered by dataset count, most first.
 */
router.get("/community/regions", async (req, res): Promise<void> => {
  req.log.info("Listing community regions");

  const rows = await db
    .select({
      region: communityDatasetsTable.region,
      datasetCount: sql<number>`count(*)::int`,
      totalSizeBytes: sql<number>`coalesce(sum(${communityDatasetsTable.sizeBytes}), 0)::int`,
      totalDistanceMeters: sql<
        number | null
      >`sum(${communityDatasetsTable.distanceMeters})`,
    })
    .from(communityDatasetsTable)
    .where(isNotNull(communityDatasetsTable.region))
    .groupBy(communityDatasetsTable.region)
    .orderBy(desc(sql`count(*)`));

  const regions = rows
    .map((r) => {
      // region is non-null here (filtered above), but narrow for the type.
      const name = r.region;
      if (name === null) return null;
      const kind = regionKind(name);
      if (kind === null) return null;
      return {
        region: name,
        kind,
        datasetCount: r.datasetCount,
        totalSizeBytes: r.totalSizeBytes,
        totalDistanceMeters:
          r.totalDistanceMeters === null ? null : Number(r.totalDistanceMeters),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  res.json(ListCommunityRegionsResponse.parse(regions));
});

/**
 * POST /community/datasets/bulk
 *
 * Accept up to 20 datasets per call. Each item is validated and inserted
 * independently — one bad payload never aborts the whole batch. Returns a
 * per-item result array in the same order as the input.
 */
router.post("/community/datasets/bulk", async (req, res): Promise<void> => {
  const parsed = BulkCreateCommunityDatasetsBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid bulk dataset payload");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const results: Array<{ success: boolean; dataset?: unknown; error?: string }> = [];

  for (const item of parsed.data.datasets) {
    try {
      const dataset = await insertCommunityDataset(item);
      results.push({ success: true, dataset });
    } catch (err) {
      if (err instanceof DatasetValidationError) {
        results.push({ success: false, error: err.message });
      } else {
        req.log.error({ err }, "Error inserting bulk dataset item");
        results.push({ success: false, error: "Internal server error" });
      }
    }
  }

  req.log.info({ total: results.length, succeeded: results.filter(r => r.success).length }, "Bulk dataset insert complete");
  res.json(BulkCreateCommunityDatasetsResponse.parse({ results }));
});

router.post("/community/datasets", async (req, res): Promise<void> => {
  const parsed = CreateCommunityDatasetBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid dataset payload");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, description, format, author, geojson } = parsed.data;

  // Minimal GeoJSON shape validation — must be a FeatureCollection with features[]
  const fc = geojson as {
    type?: unknown;
    features?: unknown;
  };
  if (
    fc.type !== "FeatureCollection" ||
    !Array.isArray(fc.features) ||
    fc.features.length === 0
  ) {
    res
      .status(400)
      .json({ error: "geojson must be a non-empty FeatureCollection" });
    return;
  }
  const features = fc.features as unknown[];
  const featureCount = features.length;

  // Compute simple bounding box from coordinates, including GeometryCollection
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  const visitCoords = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (
      c.length >= 2 &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      const lng = c[0];
      const lat = c[1];
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    } else {
      for (const sub of c) visitCoords(sub);
    }
  };
  const visitGeom = (g: unknown): void => {
    if (!g || typeof g !== "object") return;
    const geom = g as {
      type?: unknown;
      coordinates?: unknown;
      geometries?: unknown;
    };
    if (geom.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
      for (const sub of geom.geometries) visitGeom(sub);
    } else if (geom.coordinates !== undefined) {
      visitCoords(geom.coordinates);
    }
  };
  for (const f of features) {
    if (f && typeof f === "object") {
      visitGeom((f as { geometry?: unknown }).geometry);
    }
  }
  const hasBounds = Number.isFinite(west) && Number.isFinite(south);

  const serialized = JSON.stringify(geojson);
  const sizeBytes = Buffer.byteLength(serialized, "utf8");
  const MAX_GEOJSON_BYTES = 8 * 1024 * 1024; // 8MB
  if (sizeBytes > MAX_GEOJSON_BYTES) {
    res.status(400).json({ error: "geojson payload exceeds 8MB limit" });
    return;
  }

  const stats = routeStats(geojson);
  const [row] = await db
    .insert(communityDatasetsTable)
    .values({
      name,
      description: description ?? null,
      format,
      author: author ?? null,
      geojson,
      featureCount,
      sizeBytes,
      boundsWest: hasBounds ? west : null,
      boundsSouth: hasBounds ? south : null,
      boundsEast: hasBounds ? east : null,
      boundsNorth: hasBounds ? north : null,
      region: hasBounds ? regionFromBounds(west, south, east, north) : null,
      distanceMeters: stats.distanceMeters,
      elevationGainMeters: stats.elevationGainMeters,
    })
    .returning(SUMMARY_COLUMNS);

  req.log.info({ id: row?.id, name }, "Community dataset created");
  res.status(201).json(ListCommunityDatasetsResponseItem.parse(row));
});

router.get("/community/datasets/:id", async (req, res): Promise<void> => {
  const params = GetCommunityDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .update(communityDatasetsTable)
    .set({ downloadCount: sql`${communityDatasetsTable.downloadCount} + 1` })
    .where(eq(communityDatasetsTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  res.json(GetCommunityDatasetResponse.parse(publicCommunityDataset(row)));
});

// ---------------------------------------------------------------------------
// Supportal trail sync — check the upstream Adventure Collective catalog for new
// GPX trails and import them server-side on a maintainer's confirmation. Imports
// run here (parse + insert) rather than per-user GPX downloads.
// ---------------------------------------------------------------------------

const SUPPORTAL_BASE = "https://api.supportal.ai/api/trails/gpx";
const SUPPORTAL_PAGE_LIMIT = 1000;
const SUPPORTAL_AUTHOR = "Adventure Collective";
// Import all new trails in one sync call. With concurrency 20 and ~700 items
// a full sync takes roughly 1 minute — acceptable for a one-time admin tap.
const SUPPORTAL_SYNC_CAP = 2000;
const SUPPORTAL_DOWNLOAD_CONCURRENCY = 20;
// Cache the upstream list briefly so repeated status checks don't hammer Supportal.
const SUPPORTAL_CACHE_TTL_MS = 10 * 60 * 1000;

type SupportalItem = {
  id: string;
  name: string;
  description: string;
  url: string;
};
type SupportalPage = {
  success: boolean;
  data: { gpx: SupportalItem[]; hasMore: boolean };
};

let supportalCache: { items: SupportalItem[]; fetchedAt: number } | null = null;
let supportalSyncInFlight = false;

// Full-sync fire-and-forget state (mirrors the Overpass stateImportProgress pattern).
let supportalFullSyncInFlight = false;
let supportalSyncAborted = false;
let supportalFullSyncProgress: {
  imported: number;
  failed: number;
  remaining: number;
  total: number;
} | null = null;

/** Paginate the Supportal API until exhausted, returning every GPX trail. */
async function fetchAllSupportalTracks(): Promise<SupportalItem[]> {
  const all: SupportalItem[] = [];
  let page = 1;
  // Hard page cap guards against an unbounded loop if upstream misbehaves.
  while (page <= 500) {
    const res = await fetch(
      `${SUPPORTAL_BASE}?page=${page}&limit=${SUPPORTAL_PAGE_LIMIT}`,
    );
    if (!res.ok) {
      throw new Error(`Supportal API error ${res.status} on page ${page}`);
    }
    const json = (await res.json()) as SupportalPage;
    if (!json.success || !Array.isArray(json.data?.gpx)) break;
    all.push(...json.data.gpx);
    if (!json.data.hasMore) break;
    page++;
  }
  return all;
}

/** Upstream list with a short in-memory TTL cache so status checks stay cheap. */
async function getSupportalTracks(
  forceRefresh = false,
): Promise<SupportalItem[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    supportalCache &&
    now - supportalCache.fetchedAt < SUPPORTAL_CACHE_TTL_MS
  ) {
    return supportalCache.items;
  }
  const items = await fetchAllSupportalTracks();
  supportalCache = { items, fetchedAt: now };
  return items;
}

/** Pull the `[supportal:<id>]` dedup marker out of a stored description. */
function extractSupportalId(description: string | null): string | null {
  const m = description?.match(/\[supportal:([^\]]+)\]/);
  return m ? m[1] : null;
}

/** Set of Supportal ids already present in the community library. */
async function fetchImportedSupportalIds(): Promise<Set<string>> {
  const rows = await db
    .select({ description: communityDatasetsTable.description })
    .from(communityDatasetsTable)
    .where(like(communityDatasetsTable.description, "%[supportal:%"));
  const ids = new Set<string>();
  for (const row of rows) {
    const id = extractSupportalId(row.description);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Set of display names already imported from Supportal. Used as a secondary
 * dedup guard: Supportal sometimes issues multiple distinct IDs for routes
 * that share the same display name, which would produce duplicate-looking
 * entries in the library. Skipping by name keeps the library clean.
 */
async function fetchImportedSupportalNames(): Promise<Set<string>> {
  const rows = await db
    .select({ name: communityDatasetsTable.name })
    .from(communityDatasetsTable)
    .where(like(communityDatasetsTable.description, "%[supportal:%"));
  return new Set(rows.map((r) => r.name));
}

/** Append the dedup marker so a re-sync can recognise already-imported trails. */
function buildSupportalDescription(item: SupportalItem): string {
  const parts: string[] = [];
  if (item.description?.trim()) parts.push(item.description.trim());
  parts.push(`[supportal:${item.id}]`);
  return parts.join(" ");
}

/** Download a trail's GPX and parse it to GeoJSON; null on any failure. */
async function downloadAndParseSupportalGpx(
  item: SupportalItem,
): Promise<{ type: string; features: unknown[] } | null> {
  // Only follow https URLs from the upstream catalog. This blocks SSRF vectors
  // (file://, internal http endpoints) if the upstream response is ever poisoned.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(item.url);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== "https:") return null;

  // Hard 30-second timeout per file so a hanging download doesn't stall the
  // entire concurrent chunk indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(item.url, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const fc = toGeoJSON.gpx(doc);
    if (!fc?.features?.length) return null;
    return fc;
  } catch (err) {
    // Surface the error string so callers can log a sample for diagnostics.
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

router.get("/community/supportal/status", async (req, res): Promise<void> => {
  let items: SupportalItem[];
  try {
    items = await getSupportalTracks();
  } catch (err) {
    req.log.error({ err }, "Supportal status: upstream fetch failed");
    res
      .status(502)
      .json({ error: "Could not reach the Supportal trail service." });
    return;
  }

  const importedIds = await fetchImportedSupportalIds();
  const availableIds = new Set(items.map((t) => t.id));
  let importedCount = 0;
  for (const id of importedIds) if (availableIds.has(id)) importedCount++;
  const newCount = items.filter((t) => !importedIds.has(t.id)).length;

  res.json(
    GetSupportalStatusResponse.parse({
      availableCount: items.length,
      importedCount,
      newCount,
    }),
  );
});

router.post("/community/supportal/sync", async (req, res): Promise<void> => {
  if (supportalSyncInFlight) {
    res.status(409).json({ error: "A Supportal sync is already in progress." });
    return;
  }
  supportalSyncInFlight = true;
  try {
    let items: SupportalItem[];
    try {
      // Force a fresh upstream read so the import reflects the latest catalog.
      items = await getSupportalTracks(true);
    } catch (err) {
      req.log.error({ err }, "Supportal sync: upstream fetch failed");
      res
        .status(502)
        .json({ error: "Could not reach the Supportal trail service." });
      return;
    }

    const [importedIds, importedNames] = await Promise.all([
      fetchImportedSupportalIds(),
      fetchImportedSupportalNames(),
    ]);
    const newItems = items.filter(
      (t) => !importedIds.has(t.id) && !importedNames.has(t.name),
    );
    const batch = newItems.slice(0, SUPPORTAL_SYNC_CAP);

    let imported = 0;
    let failed = 0;
    for (let i = 0; i < batch.length; i += SUPPORTAL_DOWNLOAD_CONCURRENCY) {
      const chunk = batch.slice(i, i + SUPPORTAL_DOWNLOAD_CONCURRENCY);
      const parsed = await Promise.all(
        chunk.map(async (item) => ({
          item,
          fc: await downloadAndParseSupportalGpx(item),
        })),
      );
      for (const { item, fc } of parsed) {
        if (!fc) {
          failed++;
          continue;
        }
        try {
          await insertCommunityDataset({
            name: item.name,
            description: buildSupportalDescription(item),
            format: "gpx",
            author: SUPPORTAL_AUTHOR,
            geojson: fc,
            kind: "trail",
          });
          imported++;
        } catch (err) {
          req.log.warn(
            { err, supportalId: item.id },
            "Supportal sync: insert failed",
          );
          failed++;
        }
      }
    }

    // New trails still missing after this batch: everything new minus what we
    // actually imported (parse/insert failures stay "new" and retry next tap).
    const remaining = Math.max(0, newItems.length - imported);
    req.log.info({ imported, failed, remaining }, "Supportal sync complete");
    res.json(SyncSupportalResponse.parse({ imported, failed, remaining }));
  } finally {
    supportalSyncInFlight = false;
  }
});

/**
 * GET /community/supportal/sync-all/status
 *
 * Returns the current state of a running full Supportal sync-all job.
 * Returns { inProgress: false } when no job is running.
 */
router.get("/community/supportal/sync-all/status", (_req, res): void => {
  res.json({
    inProgress: supportalFullSyncInFlight,
    progress: supportalFullSyncProgress,
  });
});

/**
 * Shared batch loop used by both the HTTP sync-all route and the server-startup
 * auto-sync. Caller must set `supportalFullSyncInFlight = true` and populate
 * `supportalFullSyncProgress` before calling, and must ensure no concurrent
 * call is already in flight.
 */
async function _runSupportalSyncLoop(newItems: SupportalItem[]): Promise<void> {
  try {
    let queue = [...newItems];
    let totalImported = 0;
    let totalFailed = 0;
    let firstChunkError: string | null = null;

    while (queue.length > 0) {
      if (supportalSyncAborted) {
        logger.info("Supportal sync-all: aborted");
        break;
      }
      const chunk = queue.slice(0, SUPPORTAL_DOWNLOAD_CONCURRENCY);
      queue = queue.slice(SUPPORTAL_DOWNLOAD_CONCURRENCY);

      const settled = await Promise.allSettled(
        chunk.map((item) => downloadAndParseSupportalGpx(item).then((fc) => ({ item, fc }))),
      );

      let chunkImported = 0;
      let chunkFailed = 0;
      for (const result of settled) {
        if (result.status === "rejected") {
          chunkFailed++;
          if (firstChunkError === null) firstChunkError = String(result.reason);
          continue;
        }
        const { item, fc } = result.value;
        if (!fc) { chunkFailed++; continue; }
        try {
          // Re-check against committed rows immediately before inserting.
          // The up-front snapshot can go stale while 20 downloads run in
          // parallel — this per-item check is the actual dedup gate.
          const alreadyById = await db
            .select({ id: communityDatasetsTable.id })
            .from(communityDatasetsTable)
            .where(like(communityDatasetsTable.description, `%[supportal:${item.id}]%`))
            .limit(1);
          if (alreadyById.length > 0) continue; // already in DB

          const alreadyByName = await db
            .select({ id: communityDatasetsTable.id })
            .from(communityDatasetsTable)
            .where(
              and(
                eq(communityDatasetsTable.name, item.name),
                like(communityDatasetsTable.description, "%[supportal:%"),
              ),
            )
            .limit(1);
          if (alreadyByName.length > 0) continue; // duplicate name from Supportal

          await insertCommunityDataset({
            name: item.name,
            description: buildSupportalDescription(item),
            format: "gpx",
            author: SUPPORTAL_AUTHOR,
            geojson: fc,
            kind: "trail",
          });
          chunkImported++;
        } catch (err) {
          logger.warn({ err, supportalId: item.id }, "Supportal sync-all: insert failed");
          chunkFailed++;
        }
      }

      totalImported += chunkImported;
      totalFailed += chunkFailed;

      supportalFullSyncProgress = {
        imported: totalImported,
        failed: totalFailed,
        remaining: Math.max(0, newItems.length - totalImported - totalFailed),
        total: newItems.length,
      };

      if (firstChunkError && totalImported === 0 && totalFailed === chunk.length) {
        logger.warn({ sampleError: firstChunkError }, "Supportal sync-all: first chunk all-failed");
        firstChunkError = null;
      }
    }
    logger.info(supportalFullSyncProgress, "Supportal sync-all: complete");
  } finally {
    supportalFullSyncInFlight = false;
  }
}

/**
 * Fetch all new Supportal trails from the upstream API and import them into
 * the community library. Safe to call multiple times — already-imported trails
 * are skipped and concurrent runs are no-ops.
 *
 * Called automatically on server startup so the library stays current without
 * requiring an admin to trigger the sync manually.
 */
export async function runSupportalSyncAll(): Promise<void> {
  if (supportalFullSyncInFlight) {
    logger.info("Supportal auto-sync: already running, skipping");
    return;
  }

  let allItems: SupportalItem[];
  try {
    allItems = await getSupportalTracks(true);
  } catch (err) {
    logger.error({ err }, "Supportal auto-sync: upstream fetch failed");
    return;
  }

  const [importedIds, importedNames] = await Promise.all([
    fetchImportedSupportalIds(),
    fetchImportedSupportalNames(),
  ]);
  const newItems = allItems.filter(
    (t) => !importedIds.has(t.id) && !importedNames.has(t.name),
  );

  if (newItems.length === 0) {
    logger.info("Supportal auto-sync: nothing new");
    return;
  }

  supportalFullSyncInFlight = true;
  supportalSyncAborted = false;
  supportalFullSyncProgress = { imported: 0, failed: 0, remaining: newItems.length, total: newItems.length };
  logger.info({ total: newItems.length }, "Supportal auto-sync: starting");
  await _runSupportalSyncLoop(newItems);
}

/**
 * POST /community/supportal/sync-all
 *
 * Fire-and-forget: loops through all new Supportal trails until none remain,
 * without blocking the HTTP response.
 * Returns immediately with { status: "started" | "already_running" | "nothing_new" }.
 */
router.post("/community/supportal/sync-all", async (req, res): Promise<void> => {
  if (supportalFullSyncInFlight) {
    res.status(409).json({ status: "already_running", progress: supportalFullSyncProgress });
    return;
  }

  let allItems: SupportalItem[];
  try {
    allItems = await getSupportalTracks(true);
  } catch (err) {
    req.log.error({ err }, "Supportal sync-all: upstream fetch failed");
    res.status(502).json({ error: "Could not reach the Supportal trail service." });
    return;
  }

  const [importedIds, importedNames] = await Promise.all([
    fetchImportedSupportalIds(),
    fetchImportedSupportalNames(),
  ]);
  const newItems = allItems.filter(
    (t) => !importedIds.has(t.id) && !importedNames.has(t.name),
  );

  if (newItems.length === 0) {
    res.json({ status: "nothing_new" });
    return;
  }

  supportalFullSyncInFlight = true;
  supportalSyncAborted = false;
  supportalFullSyncProgress = { imported: 0, failed: 0, remaining: newItems.length, total: newItems.length };
  req.log.info({ total: newItems.length }, "Supportal sync-all: starting full import");
  res.json({ status: "started", total: newItems.length });

  void _runSupportalSyncLoop(newItems);
});

/**
 * POST /community/supportal/sync-all/stop
 * Signals the running Supportal sync to stop after the current chunk.
 */
router.post("/community/supportal/sync-all/stop", (_req, res): void => {
  if (!supportalFullSyncInFlight) {
    res.json({ status: "not_running" });
    return;
  }
  supportalSyncAborted = true;
  res.json({ status: "stopping" });
});

/**
 * POST /community/datasets/backfill-regions
 *
 * One-shot admin operation: find every community dataset whose `region` column
 * is NULL, recompute it from the bounding-box centroid, and write it back.
 * Safe to re-run; rows already having a region are untouched.
 * Returns { updated, skipped } where skipped = no bounds or no geo match.
 */
router.post(
  "/community/datasets/backfill-regions",
  async (req, res): Promise<void> => {
    req.log.info("Starting region backfill");

    // Fetch only the columns needed; skip rows that already have a region.
    const rows = await db
      .select({
        id: communityDatasetsTable.id,
        boundsWest: communityDatasetsTable.boundsWest,
        boundsSouth: communityDatasetsTable.boundsSouth,
        boundsEast: communityDatasetsTable.boundsEast,
        boundsNorth: communityDatasetsTable.boundsNorth,
      })
      .from(communityDatasetsTable)
      .where(isNull(communityDatasetsTable.region));

    // Compute region for each row; group ids by resolved region name so we can
    // do one UPDATE per distinct region value instead of one per row.
    const byRegion = new Map<string, string[]>();
    let skipped = 0;

    for (const row of rows) {
      const region = regionFromBounds(
        row.boundsWest,
        row.boundsSouth,
        row.boundsEast,
        row.boundsNorth,
      );
      if (!region) {
        skipped++;
        continue;
      }
      const ids = byRegion.get(region) ?? [];
      ids.push(row.id);
      byRegion.set(region, ids);
    }

    // Batch-update: one statement per distinct region value.
    let updated = 0;
    for (const [region, ids] of byRegion) {
      await db
        .update(communityDatasetsTable)
        .set({ region })
        .where(inArray(communityDatasetsTable.id, ids));
      updated += ids.length;
    }

    req.log.info({ updated, skipped }, "Region backfill complete");
    res.json({ updated, skipped });
  },
);

// ---------------------------------------------------------------------------
// Overpass OSM sync — import unpaved roads and hiking/biking trails from
// OpenStreetMap by US state.
//
// Two dataset kinds per state:
//   kind='road'  — highway=track + gravel/dirt/unpaved surfaces (overlanding)
//                  keyed by [overpass:<State>] in description
//   kind='trail' — highway=path/footway/cycleway/bridleway (hiking & biking)
//                  keyed by [overpass-trail:<State>] in description
//
// Re-running a state+kind replaces the old dataset. sync-all processes all 50
// US states in the background with a pause between requests.
// ---------------------------------------------------------------------------

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const OVERPASS_AUTHOR = "OpenStreetMap Contributors";
const OVERPASS_MAX_BYTES = 50 * 1024 * 1024;
let overpassSyncInFlight = false;
const stateImportsInFlight = new Set<string>();

type StateImportProgress = {
  cellsDone: number;
  cellsTotal: number;
  currentKind: "trail" | "road";
};
const stateImportProgress = new Map<string, StateImportProgress>();

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California",
  "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
  "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
] as const;

type OverpassKind = "road" | "trail";

interface OverpassBulkProgress {
  total: number;
  done: number;
  currentState: string | null;
  errors: { state: string; kind: OverpassKind; message: string }[];
  startedAt: string;
  completedAt: string | null;
}
let overpassBulkProgress: OverpassBulkProgress | null = null;
let overpassSyncAborted = false;

type OsmNode = { lat: number; lon: number };
type OsmWay = {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: OsmNode[];
};
type OsmResponse = { elements?: OsmWay[] };

const R5 = (n: number) => Math.round(n * 1e5) / 1e5;

function osmWaysToGeoJSON(elements: OsmWay[]): unknown {
  const features: unknown[] = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.geometry?.length) continue;
    const coords = el.geometry.map((n) => [R5(n.lon), R5(n.lat)]);
    if (coords.length < 2) continue;
    const props: Record<string, string> = {};
    if (el.tags?.name) props.name = el.tags.name;
    if (el.tags?.highway) props.highway = el.tags.highway;
    if (el.tags?.surface) props.surface = el.tags.surface;
    features.push({
      type: "Feature",
      properties: props,
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  return { type: "FeatureCollection", features };
}

function buildRoadQuery(s: number, w: number, n: number, e: number): string {
  return (
    `[out:json][timeout:90][maxsize:50000000];\n` +
    `(\n` +
    `  way["highway"="track"](${s},${w},${n},${e});\n` +
    `  way["highway"]["surface"~"^(gravel|dirt|unpaved|compacted|fine_gravel|earth|ground)$"]` +
    `["access"!="private"](${s},${w},${n},${e});\n` +
    `);\n` +
    `out geom;`
  );
}

function buildTrailQuery(s: number, w: number, n: number, e: number): string {
  return (
    `[out:json][timeout:120][maxsize:50000000];\n` +
    `(\n` +
    `  way["highway"~"^(path|footway|cycleway|bridleway)$"]` +
    `["access"!="private"]["access"!="no"](${s},${w},${n},${e});\n` +
    `);\n` +
    `out geom;`
  );
}

function overpassMarker(state: string, kind: OverpassKind): string {
  return kind === "trail" ? `[overpass-trail:${state}]` : `[overpass:${state}]`;
}

// ---------------------------------------------------------------------------
// OSM named route relations — individual named trails per state
// ---------------------------------------------------------------------------

type OsmRelationMember = { type: string; ref: number; role: string };
type OsmRelation = {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members?: OsmRelationMember[];
};
type OsmWayGeom = {
  type: "way";
  id: number;
  geometry?: Array<{ lat: number; lon: number }>;
};
type OsmRouteElement = OsmRelation | OsmWayGeom | { type: "node" };

// Per-state route import progress (runs after blobs, same fire-and-forget session).
const stateRouteImportsInFlight = new Set<string>();
type RouteImportProgress = { done: number; total: number };
const stateRouteImportProgress = new Map<string, RouteImportProgress>();

/**
 * Overpass QL query that fetches all named hiking/cycling/equestrian route
 * relations within a bbox, plus the geometry of their member ways.
 * Returns relations with tags + member refs and ways with geometry.
 */
function buildRouteRelationQuery(s: number, w: number, n: number, e: number): string {
  return (
    `[out:json][timeout:180][maxsize:100000000];\n` +
    `(\n` +
    `  relation["route"~"^(hiking|foot|mtb|horse|bicycle)$"]["name"]` +
    `["access"!="private"](${s},${w},${n},${e});\n` +
    `);\n` +
    `out body;\n` +
    `>;\n` +
    `out geom;`
  );
}

/**
 * Import every named OSM route relation in the given US state as a separate
 * community dataset, each with its own name, description, and geometry.
 * Already-imported relations (identified by [osm-route:<id>] in description)
 * are skipped so the function is safe to re-run.
 */
async function importOsmNamedRoutesForState(
  state: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const bbox = bboxForRegion(state);
  if (!bbox) throw new Error(`Unknown region: "${state}"`);
  const [west, south, east, north] = bbox;

  const query = buildRouteRelationQuery(south, west, north, east);
  let elements: OsmRouteElement[] = [];
  try {
    const resp = await fetch(OVERPASS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "mapper.one/1.0 (+https://mapper.one)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!resp.ok) throw new Error(`Overpass returned HTTP ${resp.status}`);
    const json = await resp.json() as { elements?: OsmRouteElement[]; remark?: string };
    if (json.remark) {
      logger.warn({ remark: json.remark, state }, "Overpass route query: possible truncation");
    }
    elements = json.elements ?? [];
  } catch (err) {
    logger.warn({ err, state }, "Overpass named route query failed");
    return 0;
  }

  // Build a wayId → coordinates lookup from returned way geometries.
  const wayGeom = new Map<number, [number, number][]>();
  for (const el of elements) {
    if (el.type === "way") {
      const way = el as OsmWayGeom;
      if (way.geometry?.length) {
        const coords = way.geometry.map((n) => [R5(n.lon), R5(n.lat)] as [number, number]);
        if (coords.length >= 2) wayGeom.set(way.id, coords);
      }
    }
  }

  const relations = elements.filter((el): el is OsmRelation => el.type === "relation");

  // Find already-imported relation IDs so we don't create duplicates.
  const existingRows = await db
    .select({ description: communityDatasetsTable.description })
    .from(communityDatasetsTable)
    .where(like(communityDatasetsTable.description, "%[osm-route:%"));
  const existingRelationIds = new Set<string>(
    existingRows
      .map((r) => r.description?.match(/\[osm-route:(\d+)\]/)?.[1] ?? null)
      .filter((id): id is string => id !== null),
  );

  const toImport = relations.filter((r) => !existingRelationIds.has(String(r.id)));
  logger.info({ state, total: relations.length, toImport: toImport.length }, "OSM route relations found");

  let imported = 0;
  for (let i = 0; i < toImport.length; i++) {
    onProgress?.(i, toImport.length);
    const rel = toImport[i];
    const name = rel.tags?.name?.trim();
    if (!name || name.length < 2) continue;

    // Assemble LineString features from the relation's member ways.
    const lines: [number, number][][] = [];
    for (const member of rel.members ?? []) {
      if (member.type === "way") {
        const coords = wayGeom.get(member.ref);
        if (coords) lines.push(coords);
      }
    }
    if (lines.length === 0) continue;

    const geojson = {
      type: "FeatureCollection",
      features: lines.map((coords) => ({
        type: "Feature",
        properties: { name },
        geometry: { type: "LineString", coordinates: coords },
      })),
    };

    // Build a human-readable description from available OSM tags.
    const tags = rel.tags ?? {};
    const parts: string[] = [];
    if (tags.description) parts.push(tags.description);
    if (tags.distance) parts.push(`Distance: ${tags.distance}`);
    if (tags.operator) parts.push(`Operator: ${tags.operator}`);
    if (tags.network) parts.push(`Network: ${tags.network}`);
    parts.push(`[osm-route:${rel.id}]`);

    try {
      await insertCommunityDataset({
        name,
        description: parts.join(" · "),
        format: "geojson",
        author: "OpenStreetMap contributors",
        geojson,
        kind: "trail",
      });
      imported++;
    } catch (err) {
      logger.warn({ err, relationId: rel.id, state }, "OSM route: insert failed");
    }
  }

  onProgress?.(toImport.length, toImport.length);
  logger.info({ state, imported, skipped: toImport.length - imported }, "OSM named routes import done");
  return imported;
}

type OverpassJson = OsmResponse & { remark?: string };

async function fetchOverpassWays(query: string): Promise<OsmWay[]> {
  const resp = await fetch(OVERPASS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "User-Agent": "mapper.one/1.0 (+https://mapper.one)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!resp.ok) throw new Error(`Overpass returned HTTP ${resp.status}`);
  const json = (await resp.json()) as OverpassJson;
  if (json.remark) {
    logger.warn({ remark: json.remark }, "Overpass remark (possible truncation)");
  }
  return json.elements ?? [];
}

/**
 * Divide a bounding box into a grid of cells with the given step size (degrees).
 * Returns [west, south, east, north] for each cell.
 */
function makeGrid(
  west: number,
  south: number,
  east: number,
  north: number,
  step: number,
): [number, number, number, number][] {
  const cells: [number, number, number, number][] = [];
  // Snap to grid to avoid floating-point drift across many steps.
  for (let lat = Math.floor(south / step) * step; lat < north; lat += step) {
    for (let lng = Math.floor(west / step) * step; lng < east; lng += step) {
      cells.push([
        Math.max(lng, west),
        Math.max(lat, south),
        Math.min(lng + step, east),
        Math.min(lat + step, north),
      ]);
    }
  }
  return cells;
}

/**
 * Import (or re-import) OSM data for one state and one kind.
 *
 * To keep each Overpass request under the server's ~10MB practical limit, the
 * state bbox is tiled into 1°×1° grid cells. Ways are deduplicated across
 * cells by OSM ID so border-crossing ways are stored only once. The merged
 * result is stored as a single community dataset.
 *
 * Returns the number of features inserted, or 0 if skipped (no features).
 */
async function importOverpassForState(
  state: string,
  kind: OverpassKind,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const bbox = bboxForRegion(state);
  if (!bbox) throw new Error(`Unknown region: "${state}"`);
  const [west, south, east, north] = bbox;

  // 1°×1° tiles keep each query well under Overpass's 50MB maxsize.
  const cells = makeGrid(west, south, east, north, 1.0);
  const wayById = new Map<number, OsmWay>();

  for (let i = 0; i < cells.length; i++) {
    const [cw, cs, ce, cn] = cells[i];
    try {
      const query =
        kind === "road"
          ? buildRoadQuery(cs, cw, cn, ce)
          : buildTrailQuery(cs, cw, cn, ce);
      const elements = await fetchOverpassWays(query);
      for (const el of elements) {
        if (el.type === "way" && !wayById.has(el.id)) {
          wayById.set(el.id, el);
        }
      }
    } catch (err) {
      logger.warn({ state, kind, cell: [cw, cs, ce, cn], err }, "Overpass: cell failed, continuing");
    }
    onProgress?.(i + 1, cells.length);
    // Brief pause between cell requests to respect Overpass rate limits.
    await new Promise<void>((r) => setTimeout(r, 2000));
  }

  const fc = osmWaysToGeoJSON([...wayById.values()]);
  const featureCount = (fc as { features: unknown[] }).features.length;

  if (featureCount === 0) {
    logger.info({ state, kind, cells: cells.length }, "Overpass: no features, skipping");
    return 0;
  }

  const marker = overpassMarker(state, kind);

  // Replace any previous dataset for this state+kind.
  const existing = await db
    .select({ id: communityDatasetsTable.id })
    .from(communityDatasetsTable)
    .where(like(communityDatasetsTable.description, `%${marker}%`));

  if (existing.length > 0) {
    await db
      .delete(communityDatasetsTable)
      .where(inArray(communityDatasetsTable.id, existing.map((r) => r.id)));
    logger.info({ state, kind, replaced: existing.length }, "Overpass: replaced old dataset");
  }

  const name =
    kind === "road"
      ? `${state} Overlanding Roads`
      : `${state} OSM Trails`;
  const description =
    kind === "road"
      ? `Unpaved roads and tracks in ${state} from OpenStreetMap (highway=track and gravel/dirt/unpaved surfaces). ${marker}`
      : `Hiking and biking trails in ${state} from OpenStreetMap (highway=path/footway/cycleway/bridleway). ${marker}`;

  await insertCommunityDataset({
    name,
    description,
    format: "geojson",
    author: OVERPASS_AUTHOR,
    geojson: fc,
    kind,
    maxSizeBytes: OVERPASS_MAX_BYTES,
  });

  logger.info({ state, kind, featureCount, cells: cells.length }, "Overpass: import complete");
  return featureCount;
}

/**
 * GET /community/overpass/status
 *
 * Returns which US states have Overpass data (roads and/or trails) already
 * imported into the community library.
 */
router.get("/community/overpass/status", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: communityDatasetsTable.id,
      name: communityDatasetsTable.name,
      description: communityDatasetsTable.description,
      featureCount: communityDatasetsTable.featureCount,
      createdAt: communityDatasetsTable.createdAt,
    })
    .from(communityDatasetsTable)
    .where(like(communityDatasetsTable.description, "%[overpass%"))
    .orderBy(desc(communityDatasetsTable.createdAt));

  const importedStates = rows.map((row) => {
    const m =
      row.description?.match(/\[overpass-trail:([^\]]+)\]/) ??
      row.description?.match(/\[overpass:([^\]]+)\]/);
    const state = m ? m[1] : row.name;
    return {
      state,
      featureCount: row.featureCount,
      datasetId: row.id,
      importedAt: row.createdAt.toISOString(),
    };
  });

  req.log.info({ count: importedStates.length }, "Overpass status requested");
  res.json(GetOverpassStatusResponse.parse({ importedStates }));
});

/**
 * GET /community/overpass/sync-all/status
 *
 * Returns the progress of a running or recently completed bulk sync.
 */
router.get("/community/overpass/sync-all/status", (req, res): void => {
  if (!overpassBulkProgress) {
    res.json({ running: false, progress: null });
    return;
  }
  res.json({
    running: overpassBulkProgress.completedAt === null,
    progress: overpassBulkProgress,
  });
});

/**
 * POST /community/overpass/sync-state
 *
 * Fire-and-forget: kick off a background import of both trail and road OSM
 * data for a single US state. Returns immediately so the mobile client can
 * poll for completion. Skips any kind that is already present in the DB.
 */
router.post("/community/overpass/sync-state", async (req, res): Promise<void> => {
  const state =
    typeof req.body?.state === "string" ? req.body.state.trim() : "";
  if (!state) {
    res.status(400).json({ error: "state is required" });
    return;
  }

  if (!bboxForRegion(state)) {
    res.status(400).json({ error: `Unknown region: "${state}"` });
    return;
  }

  if (stateImportsInFlight.has(state)) {
    res.json({ status: "in_progress", state });
    return;
  }

  const trailMarker = overpassMarker(state, "trail");
  const roadMarker = overpassMarker(state, "road");
  const existing = await db
    .select({ description: communityDatasetsTable.description })
    .from(communityDatasetsTable)
    .where(
      or(
        like(communityDatasetsTable.description, `%${trailMarker}%`),
        like(communityDatasetsTable.description, `%${roadMarker}%`),
      ),
    );
  const hasTrail = existing.some((r) => r.description?.includes(trailMarker));
  const hasRoad = existing.some((r) => r.description?.includes(roadMarker));

  // Check whether named route relations have already been imported for this state.
  const hasRoutes = hasTrail && hasRoad
    ? (await db
        .select({ id: communityDatasetsTable.id })
        .from(communityDatasetsTable)
        .where(
          and(
            eq(communityDatasetsTable.region, state),
            like(communityDatasetsTable.description, "%[osm-route:%"),
          ),
        )
        .limit(1)).length > 0
    : false;

  if (hasTrail && hasRoad && hasRoutes) {
    res.json({ status: "exists", state });
    return;
  }

  stateImportsInFlight.add(state);
  stateImportProgress.set(state, { cellsDone: 0, cellsTotal: 0, currentKind: hasTrail ? "road" : "trail" });
  void (async () => {
    try {
      // Phase 1: blob imports (trail + road coverage layer).
      if (!hasTrail) {
        stateImportProgress.set(state, { cellsDone: 0, cellsTotal: 0, currentKind: "trail" });
        await importOverpassForState(state, "trail", (done, total) => {
          stateImportProgress.set(state, { cellsDone: done, cellsTotal: total, currentKind: "trail" });
        }).catch((err) => logger.warn({ err, state }, "sync-state: trail import failed"));
      }
      if (!hasRoad) {
        stateImportProgress.set(state, { cellsDone: 0, cellsTotal: 0, currentKind: "road" });
        await importOverpassForState(state, "road", (done, total) => {
          stateImportProgress.set(state, { cellsDone: done, cellsTotal: total, currentKind: "road" });
        }).catch((err) => logger.warn({ err, state }, "sync-state: road import failed"));
      }
      stateImportProgress.delete(state);

      // Phase 2: named route relations — individual library entries per trail.
      if (!hasRoutes) {
        stateRouteImportsInFlight.add(state);
        stateRouteImportProgress.set(state, { done: 0, total: 0 });
        await importOsmNamedRoutesForState(state, (done, total) => {
          stateRouteImportProgress.set(state, { done, total });
        }).catch((err) => logger.warn({ err, state }, "sync-state: named routes import failed"));
        stateRouteImportsInFlight.delete(state);
        stateRouteImportProgress.delete(state);
      }

      logger.info({ state }, "sync-state: complete");
    } finally {
      stateImportsInFlight.delete(state);
      stateImportProgress.delete(state);
      stateRouteImportsInFlight.delete(state);
      stateRouteImportProgress.delete(state);
    }
  })();

  res.json({ status: "started", state });
});

/**
 * GET /community/overpass/sync-state/status?state=X
 *
 * Returns whether a fire-and-forget import is still running for the given
 * state. The mobile client polls this while showing the "importing" banner.
 */
router.get("/community/overpass/sync-state/status", (req, res): void => {
  const state = typeof req.query.state === "string" ? req.query.state : null;
  if (!state) {
    res.status(400).json({ error: "state query param required" });
    return;
  }
  const inProgress = stateImportsInFlight.has(state) || stateRouteImportsInFlight.has(state);
  const progress = stateImportProgress.get(state) ?? null;
  const routeProgress = stateRouteImportProgress.get(state) ?? null;
  res.json({ state, inProgress, progress, routeProgress });
});

/**
 * POST /community/overpass/sync
 *
 * Imports or re-imports OSM data for the given US state and kind
 * ('road' or 'trail', defaults to 'road'). Safe to re-run.
 */
router.post("/community/overpass/sync", async (req, res): Promise<void> => {
  if (overpassSyncInFlight) {
    res.status(409).json({ error: "An Overpass sync is already in progress." });
    return;
  }

  const parsed = SyncOverpassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { state } = parsed.data;
  const kind: OverpassKind =
    req.body.kind === "trail" ? "trail" : "road";

  if (!bboxForRegion(state)) {
    res.status(400).json({ error: `Unknown region: "${state}"` });
    return;
  }

  overpassSyncInFlight = true;
  try {
    const featureCount = await importOverpassForState(state, kind);
    res.json(
      SyncOverpassResponse.parse({
        state,
        featureCount,
        imported: featureCount > 0,
        skipped: featureCount === 0,
      }),
    );
  } catch (err) {
    req.log.warn({ err, state, kind }, "Overpass sync failed");
    res.status(502).json({
      error: err instanceof Error ? err.message : "Overpass sync failed",
    });
  } finally {
    overpassSyncInFlight = false;
  }
});

/**
 * Import OSM road + trail data for all 50 US states sequentially.
 * Called automatically on server startup; also exposed via HTTP for manual
 * re-runs. A 3-second pause between each state+kind request respects the
 * Overpass API rate limit (~4 hours total for all 50 states × 2 kinds).
 */
export async function runOverpassSyncAll(): Promise<void> {
  if (overpassSyncInFlight) {
    logger.info("Overpass auto-sync: already running, skipping");
    return;
  }
  overpassSyncInFlight = true;
  overpassSyncAborted = false;
  const total = US_STATES.length * 2;
  overpassBulkProgress = {
    total,
    done: 0,
    currentState: null,
    errors: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  logger.info({ total }, "Overpass sync-all: starting");
  try {
    for (const state of US_STATES) {
      if (overpassSyncAborted) {
        logger.info("Overpass sync-all: aborted");
        break;
      }
      overpassBulkProgress.currentState = state;
      for (const kind of ["road", "trail"] as const) {
        if (overpassSyncAborted) break;
        try {
          const overpassSource = `overpass-${kind}` as const;
          const already = await db
            .select({ region: syncCompletionsTable.region })
            .from(syncCompletionsTable)
            .where(and(eq(syncCompletionsTable.source, overpassSource), eq(syncCompletionsTable.region, state)))
            .limit(1);
          if (already.length > 0) {
            logger.info({ state, kind }, "Overpass sync-all: already complete, skipping");
          } else {
            const imported = await importOverpassForState(state, kind);
            await db.insert(syncCompletionsTable)
              .values({ source: overpassSource, region: state, recordCount: imported })
              .onConflictDoUpdate({
                target: [syncCompletionsTable.source, syncCompletionsTable.region],
                set: { completedAt: new Date(), recordCount: imported },
              });
            await new Promise<void>((r) => setTimeout(r, 3000));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn({ state, kind, message }, "Overpass sync-all: state failed");
          overpassBulkProgress.errors.push({ state, kind, message });
        }
        overpassBulkProgress.done++;
      }
    }
  } finally {
    overpassBulkProgress.currentState = null;
    overpassBulkProgress.completedAt = new Date().toISOString();
    overpassSyncInFlight = false;
    logger.info(
      { done: overpassBulkProgress.done, errors: overpassBulkProgress.errors.length },
      "Overpass sync-all complete",
    );
  }
}

/**
 * POST /community/overpass/sync-all
 */
router.post("/community/overpass/sync-all", (req, res): void => {
  if (overpassSyncInFlight) {
    res.status(409).json({ error: "An Overpass sync is already in progress." });
    return;
  }
  res.json({ started: true, states: US_STATES.length, total: US_STATES.length * 2 });
  void runOverpassSyncAll();
});

/**
 * POST /community/overpass/sync-all/stop
 * Signals the running Overpass sync to stop after the current state.
 */
router.post("/community/overpass/sync-all/stop", (_req, res): void => {
  if (!overpassSyncInFlight) {
    res.json({ status: "not_running" });
    return;
  }
  overpassSyncAborted = true;
  res.json({ status: "stopping" });
});

/**
 * POST /community/datasets/backfill-kind
 *
 * One-shot admin operation: assign kind='trail' to Supportal datasets and
 * kind='road' to Overpass datasets that were imported before the kind column
 * existed. Rows with an existing kind value are untouched.
 */
router.post(
  "/community/datasets/backfill-kind",
  async (req, res): Promise<void> => {
    req.log.info("Starting kind backfill");

    const supportalRows = await db
      .select({ id: communityDatasetsTable.id })
      .from(communityDatasetsTable)
      .where(
        and(
          like(communityDatasetsTable.description, "%[supportal:%"),
          isNull(communityDatasetsTable.kind),
        ),
      );

    if (supportalRows.length > 0) {
      await db
        .update(communityDatasetsTable)
        .set({ kind: "trail" })
        .where(
          inArray(
            communityDatasetsTable.id,
            supportalRows.map((r) => r.id),
          ),
        );
    }

    const overpassRows = await db
      .select({ id: communityDatasetsTable.id })
      .from(communityDatasetsTable)
      .where(
        and(
          like(communityDatasetsTable.description, "%[overpass:%"),
          isNull(communityDatasetsTable.kind),
        ),
      );

    if (overpassRows.length > 0) {
      await db
        .update(communityDatasetsTable)
        .set({ kind: "road" })
        .where(
          inArray(
            communityDatasetsTable.id,
            overpassRows.map((r) => r.id),
          ),
        );
    }

    req.log.info(
      { trails: supportalRows.length, roads: overpassRows.length },
      "Kind backfill complete",
    );
    res.json({ trails: supportalRows.length, roads: overpassRows.length });
  },
);

/**
 * POST /community/datasets/backfill-distance
 *
 * One-shot admin operation: compute and store distance_meters (and
 * elevation_gain_meters) for community datasets that were imported before
 * those columns existed. Rows that already have a distance_meters value are
 * skipped to avoid overwriting correct data.
 */
router.post(
  "/community/datasets/backfill-distance",
  async (req, res): Promise<void> => {
    req.log.info("Starting distance backfill");

    const rows = await db
      .select({
        id: communityDatasetsTable.id,
        geojson: communityDatasetsTable.geojson,
      })
      .from(communityDatasetsTable)
      .where(isNull(communityDatasetsTable.distanceMeters));

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const stats = routeStats(row.geojson);
      if (stats.distanceMeters == null) {
        skipped++;
        continue;
      }
      await db
        .update(communityDatasetsTable)
        .set({
          distanceMeters: stats.distanceMeters,
          elevationGainMeters: stats.elevationGainMeters,
        })
        .where(eq(communityDatasetsTable.id, row.id));
      updated++;
    }

    req.log.info({ updated, skipped }, "Distance backfill complete");
    res.json({ updated, skipped });
  },
);

// ---------------------------------------------------------------------------
// USGS National Digital Trails — The National Map ArcGIS REST API
// ---------------------------------------------------------------------------

const USGS_TRAILS_URL =
  "https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/11/query";
const USGS_PAGE_SIZE = 2000;

const stateUsgsImportsInFlight = new Set<string>();
type UsgsImportProgress = { done: number; total: number };
const stateUsgsImportProgress = new Map<string, UsgsImportProgress>();

type UsgsTrailFeature = {
  type: "Feature";
  properties: {
    name: string | null;
    permanentidentifier: string | null;
    lengthmiles: number | null;
    primarytrailmaintainer: string | null;
    nationaltraildesignation: string | null;
    trailtype: string | null;
    hikerpedestrian: string | null;
  };
  geometry: { type: string; coordinates: unknown };
};

/** Fetch one page of USGS trail features from The National Map. */
async function fetchUsgsPage(
  west: number,
  south: number,
  east: number,
  north: number,
  offset: number,
): Promise<UsgsTrailFeature[]> {
  const params = new URLSearchParams({
    geometry: `${west},${south},${east},${north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields:
      "name,permanentidentifier,lengthmiles,primarytrailmaintainer,nationaltraildesignation,trailtype,hikerpedestrian",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
    resultOffset: String(offset),
    resultRecordCount: String(USGS_PAGE_SIZE),
  });
  const resp = await fetch(`${USGS_TRAILS_URL}?${params}`, {
    headers: { "User-Agent": "mapper.one/1.0 (+https://mapper.one)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`USGS API returned HTTP ${resp.status}`);
  const json = await resp.json() as { features?: UsgsTrailFeature[] };
  return json.features ?? [];
}

/**
 * Import all named USGS National Digital Trails for a US state as individual
 * community dataset entries. Trail segments sharing the same name are merged
 * into a single FeatureCollection. Already-imported trails are skipped via
 * `[usgs-trail]` description marker + name+region match so re-runs are safe.
 */
async function importUsgsTrailsForState(
  state: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const bbox = bboxForRegion(state);
  if (!bbox) throw new Error(`Unknown region: "${state}"`);
  const [west, south, east, north] = bbox;

  // Paginate through all trail segments for this state bbox.
  const allFeatures: UsgsTrailFeature[] = [];
  let offset = 0;
  while (true) {
    let page: UsgsTrailFeature[];
    try {
      page = await fetchUsgsPage(west, south, east, north, offset);
    } catch (err) {
      logger.warn({ err, state, offset }, "USGS: page fetch failed, stopping pagination");
      break;
    }
    allFeatures.push(...page.filter((f) => f.properties?.name));
    if (page.length < USGS_PAGE_SIZE) break;
    offset += USGS_PAGE_SIZE;
  }

  // Group trail segments by name → one dataset per named trail.
  const byName = new Map<string, UsgsTrailFeature[]>();
  for (const feature of allFeatures) {
    const name = feature.properties?.name?.trim();
    if (!name || name.length < 2) continue;
    const bucket = byName.get(name) ?? [];
    if (bucket.length === 0) byName.set(name, bucket);
    bucket.push(feature);
  }

  // Skip trails already in the database for this state.
  const existingRows = await db
    .select({ name: communityDatasetsTable.name })
    .from(communityDatasetsTable)
    .where(
      and(
        eq(communityDatasetsTable.region, state),
        like(communityDatasetsTable.description, "%[usgs-trail]%"),
      ),
    );
  const existingNames = new Set(existingRows.map((r) => r.name));

  const entries = [...byName.entries()].filter(([name]) => !existingNames.has(name));
  logger.info(
    { state, total: byName.size, toImport: entries.length },
    "USGS: trails grouped",
  );

  let imported = 0;
  for (let i = 0; i < entries.length; i++) {
    onProgress?.(i, entries.length);
    const [name, features] = entries[i];

    const geojson = {
      type: "FeatureCollection",
      features: features.map((f) => ({
        type: "Feature",
        properties: { name },
        geometry: f.geometry,
      })),
    };

    const maintainers = [
      ...new Set(
        features
          .map((f) => f.properties?.primarytrailmaintainer)
          .filter((m): m is string => Boolean(m)),
      ),
    ].join(", ");
    const totalMiles = features.reduce(
      (sum, f) => sum + (f.properties?.lengthmiles ?? 0),
      0,
    );
    const descParts = ["USGS National Digital Trails"];
    if (maintainers) descParts.push(`Maintained by: ${maintainers}`);
    if (totalMiles > 0.01) descParts.push(`~${totalMiles.toFixed(1)} mi`);
    descParts.push("[usgs-trail]");

    try {
      await insertCommunityDataset({
        name,
        description: descParts.join(" · "),
        format: "geojson",
        author: "USGS / The National Map",
        geojson,
        kind: "trail",
      });
      imported++;
    } catch (err) {
      if (!(err instanceof DatasetValidationError)) {
        logger.warn({ err, name, state }, "USGS: insert failed");
      }
    }
  }

  onProgress?.(entries.length, entries.length);
  logger.info(
    { state, imported, skipped: entries.length - imported },
    "USGS trails import done",
  );
  return imported;
}

/**
 * POST /community/usgs/sync-state
 *
 * Fire-and-forget: import USGS National Digital Trails for the given US state.
 * Groups trail segments by name so each named trail becomes one library entry.
 * Returns { status: "started" | "in_progress" | "exists" }.
 */
router.post("/community/usgs/sync-state", async (req, res): Promise<void> => {
  const state =
    typeof req.body?.state === "string" ? req.body.state.trim() : null;
  if (!state) {
    res.status(400).json({ error: "state required" });
    return;
  }
  if (!bboxForRegion(state)) {
    res.status(400).json({ error: `Unknown region: "${state}"` });
    return;
  }
  if (stateUsgsImportsInFlight.has(state)) {
    res.json({ status: "in_progress", state });
    return;
  }

  const existing = await db
    .select({ id: communityDatasetsTable.id })
    .from(communityDatasetsTable)
    .where(
      and(
        eq(communityDatasetsTable.region, state),
        like(communityDatasetsTable.description, "%[usgs-trail]%"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    res.json({ status: "exists", state });
    return;
  }

  stateUsgsImportsInFlight.add(state);
  stateUsgsImportProgress.set(state, { done: 0, total: 0 });
  void (async () => {
    try {
      await importUsgsTrailsForState(state, (done, total) => {
        stateUsgsImportProgress.set(state, { done, total });
      });
      logger.info({ state }, "USGS sync-state: complete");
    } catch (err) {
      logger.warn({ err, state }, "USGS sync-state: failed");
    } finally {
      stateUsgsImportsInFlight.delete(state);
      stateUsgsImportProgress.delete(state);
    }
  })();

  res.json({ status: "started", state });
});

/**
 * GET /community/usgs/sync-state/status?state=X
 *
 * Poll while a USGS import is in flight.
 */
router.get("/community/usgs/sync-state/status", (req, res): void => {
  const state =
    typeof req.query.state === "string" ? req.query.state : null;
  if (!state) {
    res.status(400).json({ error: "state query param required" });
    return;
  }
  const inProgress = stateUsgsImportsInFlight.has(state);
  const progress = stateUsgsImportProgress.get(state) ?? null;
  res.json({ state, inProgress, progress });
});

// ---------------------------------------------------------------------------
// NPS Public Trails — NPS MapServices ArcGIS REST API
// ---------------------------------------------------------------------------

const NPS_TRAILS_URL =
  "https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails/MapServer/0/query";
const NPS_PAGE_SIZE = 2000;
const NPS_PUBLIC_TRAILS_WHERE = "TRLSTATUS='Existing' AND PUBLICDISPLAY='Public Map Display'";
const YOSEMITE_EXAMPLE_TRAIL_NAMES = [
  "Mist Trail",
  "Half Dome Trail",
  "John Muir Trail",
  "Lower Yosemite Fall Trail",
  "Mariposa Grove Trail",
] as const;
const YOSEMITE_EXAMPLE_BOUNDS = [-120.1, 37.45, -118.9, 38.4] as const;
const YOSEMITE_EXAMPLE_MARKER = "[nps-yosemite-example]";

type NpsTrailFeature = {
  type: "Feature";
  properties: {
    TRLNAME: string | null;
    TRLALTNAME: string | null;
    UNITNAME: string | null;
    UNITCODE: string | null;
    TRLTYPE: string | null;
    TRLSURFACE: string | null;
    TRLUSE: string | null;
    TRLSTATUS: string | null;
    MAINTAINER: string | null;
    "Shape.STLength()": number | null;
  };
  geometry: { type: string; coordinates: unknown };
};

const stateNpsImportsInFlight = new Set<string>();
type NpsImportProgress = { done: number; total: number };
const stateNpsImportProgress = new Map<string, NpsImportProgress>();

let npsFullSyncInFlight = false;
let yosemiteExampleSyncInFlight = false;
let npsFullSyncProgress: {
  done: number;
  total: number;
  currentState: string | null;
  completedAt: string | null;
} | null = null;

async function fetchNpsPage(
  west: number,
  south: number,
  east: number,
  north: number,
  offset: number,
  where = NPS_PUBLIC_TRAILS_WHERE,
): Promise<NpsTrailFeature[]> {
  const params = new URLSearchParams({
    where,
    geometry: `${west},${south},${east},${north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields:
      "TRLNAME,TRLALTNAME,UNITNAME,UNITCODE,TRLTYPE,TRLSURFACE,TRLUSE,TRLSTATUS,MAINTAINER,Shape.STLength()",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
    resultOffset: String(offset),
    resultRecordCount: String(NPS_PAGE_SIZE),
  });
  const resp = await fetch(`${NPS_TRAILS_URL}?${params}`, {
    headers: { "User-Agent": "mapper.one/1.0 (+https://mapper.one)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`NPS API returned HTTP ${resp.status}`);
  const json = await resp.json() as { features?: NpsTrailFeature[] };
  return json.features ?? [];
}

/**
 * Keep a small, recognizable set of official NPS Yosemite routes at the top of
 * the public route library. This is deliberately separate from the broad
 * state importer so a finished California sync cannot prevent these examples
 * from being added later.
 */
export async function runYosemiteExampleSync(): Promise<void> {
  if (yosemiteExampleSyncInFlight) return;
  yosemiteExampleSyncInFlight = true;
  try {
    const existing = await db
      .select({ name: communityDatasetsTable.name })
      .from(communityDatasetsTable)
      .where(like(communityDatasetsTable.description, `%${YOSEMITE_EXAMPLE_MARKER}%`));
    const existingNames = new Set(existing.map((row) => row.name));
    const neededNames = YOSEMITE_EXAMPLE_TRAIL_NAMES.filter((name) => !existingNames.has(name));
    if (!neededNames.length) return;

    const features: NpsTrailFeature[] = [];
    let offset = 0;
    const [west, south, east, north] = YOSEMITE_EXAMPLE_BOUNDS;
    const where = `${NPS_PUBLIC_TRAILS_WHERE} AND UNITCODE='YOSE'`;
    while (true) {
      const page = await fetchNpsPage(west, south, east, north, offset, where);
      features.push(...page);
      if (page.length < NPS_PAGE_SIZE) break;
      offset += NPS_PAGE_SIZE;
    }

    const byName = new Map<string, NpsTrailFeature[]>();
    for (const feature of features) {
      const name = feature.properties.TRLNAME?.trim();
      if (!name || !neededNames.includes(name as (typeof YOSEMITE_EXAMPLE_TRAIL_NAMES)[number])) continue;
      const routes = byName.get(name) ?? [];
      routes.push(feature);
      byName.set(name, routes);
    }

    let imported = 0;
    for (const name of neededNames) {
      const routes = byName.get(name);
      if (!routes?.length) {
        logger.warn({ name }, "NPS Yosemite examples: expected route was not returned");
        continue;
      }
      const trailUses = [...new Set(routes.map((route) => route.properties.TRLUSE?.trim()).filter(Boolean))];
      await insertCommunityDataset({
        name,
        description: [
          "NPS Public Trails",
          "Yosemite National Park",
          trailUses.join(" · "),
          YOSEMITE_EXAMPLE_MARKER,
        ].filter(Boolean).join(" · "),
        format: "geojson",
        author: "National Park Service",
        geojson: {
          type: "FeatureCollection",
          features: routes.map((route) => ({
            type: "Feature",
            properties: { name },
            geometry: route.geometry,
          })),
        },
        kind: "trail",
      });
      imported++;
    }
    logger.info({ imported }, "NPS Yosemite examples: complete");
  } catch (err) {
    logger.warn({ err }, "NPS Yosemite examples: sync failed");
  } finally {
    yosemiteExampleSyncInFlight = false;
  }
}

/**
 * Import all named NPS Public Trails for a US state. Trail segments sharing
 * the same TRLNAME are merged into one FeatureCollection. Cross-source dedup
 * against all existing names in the region prevents conflicts with USGS data.
 */
async function importNpsTrailsForState(
  state: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const bbox = bboxForRegion(state);
  if (!bbox) throw new Error(`Unknown region: "${state}"`);
  const [west, south, east, north] = bbox;

  const allFeatures: NpsTrailFeature[] = [];
  let offset = 0;
  while (true) {
    let page: NpsTrailFeature[];
    try {
      page = await fetchNpsPage(west, south, east, north, offset);
    } catch (err) {
      logger.warn({ err, state, offset }, "NPS: page fetch failed, stopping pagination");
      break;
    }
    allFeatures.push(...page.filter((f) => f.properties?.TRLNAME?.trim()));
    if (page.length < NPS_PAGE_SIZE) break;
    offset += NPS_PAGE_SIZE;
  }

  // Group segments by trail name.
  const byName = new Map<string, NpsTrailFeature[]>();
  for (const feature of allFeatures) {
    const name = feature.properties?.TRLNAME?.trim();
    if (!name || name.length < 2) continue;
    const bucket = byName.get(name) ?? [];
    if (bucket.length === 0) byName.set(name, bucket);
    bucket.push(feature);
  }

  // Cross-source dedup: skip any name already in the DB for this region.
  const existingRows = await db
    .select({ name: communityDatasetsTable.name })
    .from(communityDatasetsTable)
    .where(eq(communityDatasetsTable.region, state));
  const existingNames = new Set(existingRows.map((r) => r.name));

  const entries = [...byName.entries()].filter(([name]) => !existingNames.has(name));
  logger.info(
    { state, total: byName.size, toImport: entries.length },
    "NPS: trails grouped",
  );

  let imported = 0;
  for (let i = 0; i < entries.length; i++) {
    onProgress?.(i, entries.length);
    const [name, features] = entries[i];

    const geojson = {
      type: "FeatureCollection",
      features: features.map((f) => ({
        type: "Feature",
        properties: { name },
        geometry: f.geometry,
      })),
    };

    const unitName = features[0]?.properties?.UNITNAME ?? null;
    const trlUse = features[0]?.properties?.TRLUSE ?? null;
    const descParts = ["NPS Public Trails"];
    if (unitName) descParts.push(unitName);
    if (trlUse) descParts.push(trlUse);
    descParts.push("[nps-trail]");

    try {
      await insertCommunityDataset({
        name,
        description: descParts.join(" · "),
        format: "geojson",
        author: "National Park Service",
        geojson,
        kind: "trail",
      });
      imported++;
    } catch (err) {
      if (!(err instanceof DatasetValidationError)) {
        logger.warn({ err, name, state }, "NPS: insert failed");
      }
    }
  }

  onProgress?.(entries.length, entries.length);
  logger.info({ state, imported }, "NPS trails import done");
  return imported;
}

/**
 * Import NPS trails for all 50 US states sequentially.
 * Called automatically on server startup; also exposed as an HTTP route for
 * manual re-runs. Already-imported trails are skipped via cross-source dedup.
 */
export async function runNpsSyncAll(): Promise<void> {
  if (npsFullSyncInFlight) {
    logger.info("NPS auto-sync: already running, skipping");
    return;
  }
  npsFullSyncInFlight = true;
  npsFullSyncProgress = {
    done: 0,
    total: US_STATES.length,
    currentState: null,
    completedAt: null,
  };
  logger.info({ total: US_STATES.length }, "NPS sync-all: starting");
  try {
    for (const state of US_STATES) {
      npsFullSyncProgress.currentState = state;
      try {
        const already = await db
          .select({ region: syncCompletionsTable.region })
          .from(syncCompletionsTable)
          .where(and(eq(syncCompletionsTable.source, "nps"), eq(syncCompletionsTable.region, state)))
          .limit(1);
        if (already.length > 0) {
          logger.info({ state }, "NPS sync-all: state already complete, skipping");
        } else {
          const imported = await importNpsTrailsForState(state);
          await db.insert(syncCompletionsTable)
            .values({ source: "nps", region: state, recordCount: imported })
            .onConflictDoUpdate({
              target: [syncCompletionsTable.source, syncCompletionsTable.region],
              set: { completedAt: new Date(), recordCount: imported },
            });
          // Brief pause between states to avoid hammering the NPS server.
          await new Promise<void>((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        logger.warn({ err, state }, "NPS sync-all: state failed");
      }
      npsFullSyncProgress.done++;
    }
  } finally {
    npsFullSyncProgress.currentState = null;
    npsFullSyncProgress.completedAt = new Date().toISOString();
    npsFullSyncInFlight = false;
    logger.info({ done: npsFullSyncProgress.done }, "NPS sync-all: complete");
  }
}

router.get("/community/nps/sync-all/status", (_req, res): void => {
  res.json({ inProgress: npsFullSyncInFlight, progress: npsFullSyncProgress });
});

router.post("/community/nps/sync-all", (_req, res): void => {
  if (npsFullSyncInFlight) {
    res.status(409).json({ status: "already_running", progress: npsFullSyncProgress });
    return;
  }
  res.json({ status: "started", states: US_STATES.length });
  void runNpsSyncAll();
});

router.post("/community/nps/sync-state", async (req, res): Promise<void> => {
  const state =
    typeof req.body?.state === "string" ? req.body.state.trim() : null;
  if (!state || !bboxForRegion(state)) {
    res.status(400).json({ error: "valid state required" });
    return;
  }
  if (stateNpsImportsInFlight.has(state)) {
    res.json({ status: "in_progress", state });
    return;
  }
  const existing = await db
    .select({ id: communityDatasetsTable.id })
    .from(communityDatasetsTable)
    .where(
      and(
        eq(communityDatasetsTable.region, state),
        like(communityDatasetsTable.description, "%[nps-trail]%"),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    res.json({ status: "exists", state });
    return;
  }
  stateNpsImportsInFlight.add(state);
  stateNpsImportProgress.set(state, { done: 0, total: 0 });
  void (async () => {
    try {
      await importNpsTrailsForState(state, (done, total) => {
        stateNpsImportProgress.set(state, { done, total });
      });
    } catch (err) {
      logger.warn({ err, state }, "NPS sync-state: failed");
    } finally {
      stateNpsImportsInFlight.delete(state);
      stateNpsImportProgress.delete(state);
    }
  })();
  res.json({ status: "started", state });
});

router.get("/community/nps/sync-state/status", (req, res): void => {
  const state = typeof req.query.state === "string" ? req.query.state : null;
  if (!state) {
    res.status(400).json({ error: "state query param required" });
    return;
  }
  res.json({
    state,
    inProgress: stateNpsImportsInFlight.has(state),
    progress: stateNpsImportProgress.get(state) ?? null,
  });
});

// ---------------------------------------------------------------------------
// USFS National Forest System Trails — USFS EDW ArcGIS REST API
// ---------------------------------------------------------------------------

const USFS_TRAILS_URL =
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0/query";
const USFS_PAGE_SIZE = 2000;

type UsfsTrailFeature = {
  type: "Feature";
  properties: {
    trail_name: string | null;
    trail_no: string | null;
    trail_cn: string | null;
    gis_miles: number | null;
    trail_type: string | null;
    hiker_pedestrian_managed: string | null;
    national_trail_designation: number | null;
  };
  geometry: { type: string; coordinates: unknown };
};

const stateUsfsImportsInFlight = new Set<string>();
type UsfsImportProgress = { done: number; total: number };
const stateUsfsImportProgress = new Map<string, UsfsImportProgress>();

let usfsFullSyncInFlight = false;
let usfsFullSyncProgress: {
  done: number;
  total: number;
  currentState: string | null;
  completedAt: string | null;
} | null = null;

async function fetchUsfsPage(
  west: number,
  south: number,
  east: number,
  north: number,
  offset: number,
): Promise<UsfsTrailFeature[]> {
  const params = new URLSearchParams({
    where: "trail_type='TERRA'",
    geometry: `${west},${south},${east},${north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields:
      "trail_name,trail_no,trail_cn,gis_miles,trail_type,hiker_pedestrian_managed,national_trail_designation",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
    resultOffset: String(offset),
    resultRecordCount: String(USFS_PAGE_SIZE),
  });
  const resp = await fetch(`${USFS_TRAILS_URL}?${params}`, {
    headers: { "User-Agent": "mapper.one/1.0 (+https://mapper.one)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`USFS API returned HTTP ${resp.status}`);
  const json = await resp.json() as { features?: UsfsTrailFeature[] };
  return json.features ?? [];
}

/**
 * Import all named USFS National Forest System trails for a US state. Segments
 * sharing the same trail_name are merged into one FeatureCollection.
 * Cross-source dedup prevents duplicate entries with USGS/NPS data.
 */
async function importUsfsTrailsForState(
  state: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const bbox = bboxForRegion(state);
  if (!bbox) throw new Error(`Unknown region: "${state}"`);
  const [west, south, east, north] = bbox;

  const allFeatures: UsfsTrailFeature[] = [];
  let offset = 0;
  while (true) {
    let page: UsfsTrailFeature[];
    try {
      page = await fetchUsfsPage(west, south, east, north, offset);
    } catch (err) {
      logger.warn({ err, state, offset }, "USFS: page fetch failed, stopping pagination");
      break;
    }
    allFeatures.push(...page.filter((f) => f.properties?.trail_name?.trim()));
    if (page.length < USFS_PAGE_SIZE) break;
    offset += USFS_PAGE_SIZE;
  }

  // Group segments by trail name.
  const byName = new Map<string, UsfsTrailFeature[]>();
  for (const feature of allFeatures) {
    const name = feature.properties?.trail_name?.trim();
    if (!name || name.length < 2) continue;
    const bucket = byName.get(name) ?? [];
    if (bucket.length === 0) byName.set(name, bucket);
    bucket.push(feature);
  }

  // Cross-source dedup: skip any name already in the DB for this region.
  const existingRows = await db
    .select({ name: communityDatasetsTable.name })
    .from(communityDatasetsTable)
    .where(eq(communityDatasetsTable.region, state));
  const existingNames = new Set(existingRows.map((r) => r.name));

  const entries = [...byName.entries()].filter(([name]) => !existingNames.has(name));
  logger.info(
    { state, total: byName.size, toImport: entries.length },
    "USFS: trails grouped",
  );

  let imported = 0;
  for (let i = 0; i < entries.length; i++) {
    onProgress?.(i, entries.length);
    const [name, features] = entries[i];

    const geojson = {
      type: "FeatureCollection",
      features: features.map((f) => ({
        type: "Feature",
        properties: { name },
        geometry: f.geometry,
      })),
    };

    const totalMiles = features.reduce(
      (sum, f) => sum + (f.properties?.gis_miles ?? 0),
      0,
    );
    const descParts = ["USFS National Forest Trails"];
    if (totalMiles > 0.01) descParts.push(`~${totalMiles.toFixed(1)} mi`);
    descParts.push("[usfs-trail]");

    try {
      await insertCommunityDataset({
        name,
        description: descParts.join(" · "),
        format: "geojson",
        author: "USDA Forest Service",
        geojson,
        kind: "trail",
      });
      imported++;
    } catch (err) {
      if (!(err instanceof DatasetValidationError)) {
        logger.warn({ err, name, state }, "USFS: insert failed");
      }
    }
  }

  onProgress?.(entries.length, entries.length);
  logger.info({ state, imported }, "USFS trails import done");
  return imported;
}

/**
 * Import USFS trails for all 50 US states sequentially.
 * Called automatically on server startup. Already-imported trails are skipped.
 */
export async function runUsfsSyncAll(): Promise<void> {
  if (usfsFullSyncInFlight) {
    logger.info("USFS auto-sync: already running, skipping");
    return;
  }
  usfsFullSyncInFlight = true;
  usfsFullSyncProgress = {
    done: 0,
    total: US_STATES.length,
    currentState: null,
    completedAt: null,
  };
  logger.info({ total: US_STATES.length }, "USFS sync-all: starting");
  try {
    for (const state of US_STATES) {
      usfsFullSyncProgress.currentState = state;
      try {
        const already = await db
          .select({ region: syncCompletionsTable.region })
          .from(syncCompletionsTable)
          .where(and(eq(syncCompletionsTable.source, "usfs"), eq(syncCompletionsTable.region, state)))
          .limit(1);
        if (already.length > 0) {
          logger.info({ state }, "USFS sync-all: state already complete, skipping");
        } else {
          const imported = await importUsfsTrailsForState(state);
          await db.insert(syncCompletionsTable)
            .values({ source: "usfs", region: state, recordCount: imported })
            .onConflictDoUpdate({
              target: [syncCompletionsTable.source, syncCompletionsTable.region],
              set: { completedAt: new Date(), recordCount: imported },
            });
          await new Promise<void>((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        logger.warn({ err, state }, "USFS sync-all: state failed");
      }
      usfsFullSyncProgress.done++;
    }
  } finally {
    usfsFullSyncProgress.currentState = null;
    usfsFullSyncProgress.completedAt = new Date().toISOString();
    usfsFullSyncInFlight = false;
    logger.info({ done: usfsFullSyncProgress.done }, "USFS sync-all: complete");
  }
}

router.get("/community/usfs/sync-all/status", (_req, res): void => {
  res.json({ inProgress: usfsFullSyncInFlight, progress: usfsFullSyncProgress });
});

router.post("/community/usfs/sync-all", (_req, res): void => {
  if (usfsFullSyncInFlight) {
    res.status(409).json({ status: "already_running", progress: usfsFullSyncProgress });
    return;
  }
  res.json({ status: "started", states: US_STATES.length });
  void runUsfsSyncAll();
});

router.post("/community/usfs/sync-state", async (req, res): Promise<void> => {
  const state =
    typeof req.body?.state === "string" ? req.body.state.trim() : null;
  if (!state || !bboxForRegion(state)) {
    res.status(400).json({ error: "valid state required" });
    return;
  }
  if (stateUsfsImportsInFlight.has(state)) {
    res.json({ status: "in_progress", state });
    return;
  }
  const existing = await db
    .select({ id: communityDatasetsTable.id })
    .from(communityDatasetsTable)
    .where(
      and(
        eq(communityDatasetsTable.region, state),
        like(communityDatasetsTable.description, "%[usfs-trail]%"),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    res.json({ status: "exists", state });
    return;
  }
  stateUsfsImportsInFlight.add(state);
  stateUsfsImportProgress.set(state, { done: 0, total: 0 });
  void (async () => {
    try {
      await importUsfsTrailsForState(state, (done, total) => {
        stateUsfsImportProgress.set(state, { done, total });
      });
    } catch (err) {
      logger.warn({ err, state }, "USFS sync-state: failed");
    } finally {
      stateUsfsImportsInFlight.delete(state);
      stateUsfsImportProgress.delete(state);
    }
  })();
  res.json({ status: "started", state });
});

router.get("/community/usfs/sync-state/status", (req, res): void => {
  const state = typeof req.query.state === "string" ? req.query.state : null;
  if (!state) {
    res.status(400).json({ error: "state query param required" });
    return;
  }
  res.json({
    state,
    inProgress: stateUsfsImportsInFlight.has(state),
    progress: stateUsfsImportProgress.get(state) ?? null,
  });
});

router.get("/community/sync-completions", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      source: syncCompletionsTable.source,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(syncCompletionsTable)
    .groupBy(syncCompletionsTable.source);
  const completions: Record<string, number> = {};
  for (const row of rows) {
    completions[row.source] = row.count;
  }
  res.json({ total: US_STATES.length, completions });
});

export default router;
