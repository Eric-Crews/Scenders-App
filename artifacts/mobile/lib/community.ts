import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { GeoJSONFeatureCollection, Track, Waypoint } from "./types";
import { requestPrivateProjectPhotoUpload } from "./sync";
import { mobileApiBase } from "./api-base";

const AUTH_TOKEN_KEY = "auth_session_token";

export type CommunityDatasetSummary = {
  id: string;
  name: string;
  description: string | null;
  format: "geojson" | "kml" | "kmz" | "gpx";
  author: string | null;
  featureCount: number;
  boundsWest: number | null;
  boundsSouth: number | null;
  boundsEast: number | null;
  boundsNorth: number | null;
  sizeBytes: number;
  region: string | null;
  /** trail = Supportal/Adventure Collective, road = Overpass overlanding. Null for legacy. */
  kind: string | null;
  downloadCount: number;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  createdAt: string;
  source?: "scenders-ride-guide";
};

export type CommunityRegionSummary = {
  region: string;
  kind: "state" | "country";
  datasetCount: number;
  totalSizeBytes: number;
  totalDistanceMeters: number | null;
};

export type CommunityDatasetDetail = CommunityDatasetSummary & {
  geojson: GeoJSONFeatureCollection;
};

function apiBase(): string {
  return mobileApiBase();
}

function productionRideGuideApiBase(): string {
  return "https://scenders.com/api/mobile";
}

async function jsonFetch<T>(
  path: string,
  init?: RequestInit & { jsonBody?: unknown; baseUrl?: string },
): Promise<T> {
  const { jsonBody, baseUrl = apiBase(), ...rest } = init ?? {};
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  let body = rest.body;
  if (jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(jsonBody);
  }
  const res = await fetch(`${baseUrl}${path}`, { ...rest, headers, body });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error ?? "";
    } catch {
      // ignore
    }
    throw new Error(
      detail || `Request failed: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as T;
}

export type ListCommunityDatasetsParams = {
  lat?: number;
  lng?: number;
  q?: string;
  region?: string;
  page?: number;
  pageSize?: number;
};

export type CommunityDatasetPage = {
  items: CommunityDatasetSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export async function listCommunityDatasets(
  params?: ListCommunityDatasetsParams,
): Promise<CommunityDatasetPage> {
  const qs = new URLSearchParams();
  if (params?.lat != null && params?.lng != null) {
    qs.set("lat", String(params.lat));
    qs.set("lng", String(params.lng));
  }
  const term = params?.q?.trim();
  if (term) qs.set("q", term);
  const region = params?.region?.trim();
  if (region) qs.set("region", region);
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.pageSize != null) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();
  const payload = await jsonFetch<{
    items?: CommunityDatasetSummary[];
    total?: number;
    page?: number;
    pageSize?: number;
    hasMore?: boolean;
  }>(
    `/community/datasets${query ? `?${query}` : ""}`,
    { baseUrl: productionRideGuideApiBase() },
  );
  if (!Array.isArray(payload.items)) {
    throw new Error("The community library returned an unexpected response.");
  }
  return {
    items: payload.items.filter(
      (dataset) => dataset.source === "scenders-ride-guide",
    ),
    total: Number.isFinite(payload.total) ? Number(payload.total) : 0,
    page: Number.isFinite(payload.page) ? Number(payload.page) : params?.page ?? 1,
    pageSize: Number.isFinite(payload.pageSize)
      ? Number(payload.pageSize)
      : params?.pageSize ?? 30,
    hasMore: payload.hasMore === true,
  };
}

export function listCommunityRegions(): Promise<CommunityRegionSummary[]> {
  return jsonFetch<CommunityRegionSummary[]>("/community/regions", {
    baseUrl: productionRideGuideApiBase(),
  });
}

export function getCommunityDataset(
  id: string,
): Promise<CommunityDatasetDetail> {
  return jsonFetch<CommunityDatasetDetail>(`/community/datasets/${id}`, {
    baseUrl: productionRideGuideApiBase(),
  }).then((dataset) => {
    if (dataset.source !== "scenders-ride-guide") {
      throw new Error("Only published Scenders ride-guide GPX routes can be saved.");
    }
    return dataset;
  });
}

/**
 * Fetch a community dataset while streaming the response body so callers can
 * show real byte-level download progress. Falls back to a plain fetch if the
 * browser/runtime doesn't expose a readable body stream.
 */
export async function getCommunityDatasetStreamed(
  id: string,
  sizeHint: number,
  onProgress: (loaded: number, total: number) => void,
): Promise<CommunityDatasetDetail> {
  const res = await fetch(
    `${productionRideGuideApiBase()}/community/datasets/${id}`,
    {
    headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error ?? "";
    } catch {
      // ignore
    }
    throw new Error(
      detail || `Request failed: ${res.status} ${res.statusText}`,
    );
  }
  const contentLength = res.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : sizeHint;
  onProgress(0, total);

  if (!res.body) {
    // Runtime doesn't expose a readable stream — fall back to a single await.
    onProgress(total, total);
    const dataset = (await res.json()) as CommunityDatasetDetail;
    if (dataset.source !== "scenders-ride-guide") {
      throw new Error("Only published Scenders ride-guide GPX routes can be saved.");
    }
    return dataset;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }

  // Reassemble all chunks into one buffer, then JSON-parse once.
  const full = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    full.set(chunk, offset);
    offset += chunk.length;
  }
  const dataset = JSON.parse(
    new TextDecoder().decode(full),
  ) as CommunityDatasetDetail;
  if (dataset.source !== "scenders-ride-guide") {
    throw new Error("Only published Scenders ride-guide GPX routes can be saved.");
  }
  return dataset;
}

export function shareCommunityDataset(input: {
  name: string;
  description?: string | null;
  format: "geojson" | "kml" | "kmz" | "gpx";
  author?: string | null;
  geojson: GeoJSONFeatureCollection;
}): Promise<CommunityDatasetSummary> {
  return jsonFetch<CommunityDatasetSummary>("/community/datasets", {
    method: "POST",
    jsonBody: input,
  });
}

export type BlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  locationName: string | null;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  author: string | null;
  datasetId: string | null;
  createdAt: string;
};

export type BlogPost = BlogPostSummary & {
  content: string;
  imageUrls: string[];
};

function guessContentType(uri: string): string {
  const ext = uri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

/**
 * Upload a local file:// photo to cloud object storage.
 * Returns the absolute public serving URL to persist with the blog post.
 */
export async function uploadPhoto(localUri: string): Promise<string> {
  const objectPath = await uploadLocalPhoto(localUri, (input) =>
    jsonFetch("/storage/uploads/request-url", {
      method: "POST",
      jsonBody: input,
    }),
  );
  return `${apiBase()}/storage${objectPath}`;
}

/**
 * Upload a local photo for a private project and return only its private object
 * path. The path is persisted server-side and never sent to project recipients.
 */
export async function uploadPrivatePhoto(localUri: string, projectId: string): Promise<string> {
  return uploadLocalPhoto(localUri, (input) => requestPrivateProjectPhotoUpload({ ...input, projectId }));
}

async function uploadLocalPhoto(
  localUri: string,
  requestUpload: (input: {
    name: string;
    size: number;
    contentType: string;
  }) => Promise<{ uploadURL: string; objectPath: string }>,
): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error("Photo upload is not supported on web.");
  }

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    throw new Error("Photo file is missing.");
  }
  const contentType = guessContentType(localUri);
  const name = localUri.split("/").pop() ?? "photo.jpg";

  const { uploadURL, objectPath } = await requestUpload({
    name,
    size: info.size ?? 1,
    contentType,
  });

  const uploadRes = await FileSystem.uploadAsync(uploadURL, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });
  if (uploadRes.status < 200 || uploadRes.status >= 300) {
    throw new Error(`Photo upload failed (${uploadRes.status})`);
  }

  return objectPath;
}

export type FeedbackReply = {
  id: string;
  postId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type FeedbackPostSummary = {
  id: string;
  authorName: string;
  title: string;
  body: string | null;
  upvotes: number;
  replyCount: number;
  voted: boolean;
  createdAt: string;
};

export type FeedbackPost = FeedbackPostSummary & {
  replies: FeedbackReply[];
};

export function listFeedbackPosts(
  clientId: string,
): Promise<FeedbackPostSummary[]> {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return jsonFetch<FeedbackPostSummary[]>(`/community/feedback${qs}`);
}

export function getFeedbackPost(id: string): Promise<FeedbackPost> {
  return jsonFetch<FeedbackPost>(`/community/feedback/${id}`);
}

export function createFeedbackPost(input: {
  authorName: string;
  title: string;
  body?: string | null;
}): Promise<FeedbackPost> {
  return jsonFetch<FeedbackPost>("/community/feedback", {
    method: "POST",
    jsonBody: input,
  });
}

export function createFeedbackReply(
  postId: string,
  input: { authorName: string; body: string },
): Promise<FeedbackReply> {
  return jsonFetch<FeedbackReply>(`/community/feedback/${postId}/replies`, {
    method: "POST",
    jsonBody: input,
  });
}

export function upvoteFeedbackPost(
  postId: string,
  clientId: string,
): Promise<{ upvotes: number; voted: boolean }> {
  return jsonFetch<{ upvotes: number; voted: boolean }>(
    `/community/feedback/${postId}/upvote`,
    { method: "POST", jsonBody: { clientId } },
  );
}

export function createDonationCheckout(
  amountCents: number,
): Promise<{ url: string }> {
  return jsonFetch<{ url: string }>("/community/donate", {
    method: "POST",
    jsonBody: { amountCents },
  });
}

export type SupportalStatus = {
  availableCount: number;
  importedCount: number;
  newCount: number;
};

export type SupportalSyncResult = {
  imported: number;
  failed: number;
  remaining: number;
};

/**
 * How many GPX trails the upstream Adventure Collective (Supportal) catalog
 * offers, how many are already in the community library, and how many are new.
 * No import happens — this is a cheap, cached availability check.
 */
export function getSupportalStatus(): Promise<SupportalStatus> {
  return jsonFetch<SupportalStatus>("/community/supportal/status");
}

/**
 * Import a batch of new Supportal trails into the community library
 * (server-side parse + insert). Safe to re-run; returns how many were imported,
 * how many failed, and how many new trails still remain to import.
 */
export function syncSupportal(): Promise<SupportalSyncResult> {
  return jsonFetch<SupportalSyncResult>("/community/supportal/sync", {
    method: "POST",
  });
}

export type OverpassImportedState = {
  state: string;
  featureCount: number;
  datasetId: string;
  importedAt: string;
};

export type OverpassStatus = {
  importedStates: OverpassImportedState[];
};

export type OverpassSyncResult = {
  state: string;
  featureCount: number;
  imported: boolean;
  skipped: boolean;
};

/**
 * Which US states have already had their overlanding road data imported.
 */
export function getOverpassStatus(): Promise<OverpassStatus> {
  return jsonFetch<OverpassStatus>("/community/overpass/status");
}

/**
 * Import or re-import overlanding roads (highway=track + unpaved surfaces)
 * for the given US state from OpenStreetMap via the Overpass API. Replaces
 * any existing road data for that state.
 */
export function syncOverpass(state: string): Promise<OverpassSyncResult> {
  return jsonFetch<OverpassSyncResult>("/community/overpass/sync", {
    method: "POST",
    jsonBody: { state },
  });
}

export type OverpassStateSyncStatus = "started" | "in_progress" | "exists";

/**
 * Fire-and-forget: ask the server to import both trail and road OSM data for
 * the given US state in the background. Returns immediately — poll
 * getOverpassStateStatus to know when it's done.
 */
export function syncOverpassState(
  state: string,
): Promise<{ status: OverpassStateSyncStatus; state: string }> {
  return jsonFetch<{ status: OverpassStateSyncStatus; state: string }>(
    "/community/overpass/sync-state",
    { method: "POST", jsonBody: { state } },
  );
}

export type OverpassStateProgress = {
  cellsDone: number;
  cellsTotal: number;
  currentKind: "trail" | "road";
};

export type OsmRouteProgress = {
  done: number;
  total: number;
};

/**
 * Check whether a fire-and-forget import is still running for the given state,
 * and return granular cell-level progress for the blob phase, plus named-route
 * progress for the second phase.
 */
export function getOverpassStateStatus(state: string): Promise<{
  state: string;
  inProgress: boolean;
  progress: OverpassStateProgress | null;
  routeProgress: OsmRouteProgress | null;
}> {
  return jsonFetch<{
    state: string;
    inProgress: boolean;
    progress: OverpassStateProgress | null;
    routeProgress: OsmRouteProgress | null;
  }>(`/community/overpass/sync-state/status?state=${encodeURIComponent(state)}`);
}

/**
 * Build a GeoJSON FeatureCollection from a saved track + its linked waypoints,
 * upload any waypoint photos to cloud storage, then publish the whole thing as
 * a community dataset. The returned summary includes the new dataset id which
 * can be stored on the track via `updateTrack`.
 */
export async function publishTrackAsCommunityDataset(
  track: Track,
  allWaypoints: Waypoint[],
  meta: { description?: string | null; author?: string | null },
): Promise<CommunityDatasetSummary> {
  // LineString from track GPS points — include altitude when available.
  const lineCoords = track.points.map((p) =>
    typeof p.alt === "number" ? [p.lng, p.lat, p.alt] : [p.lng, p.lat],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features: any[] = [
    {
      type: "Feature",
      properties: {
        name: track.name,
        description: track.description ?? null,
        kind: track.kind ?? "recorded",
      },
      geometry: { type: "LineString", coordinates: lineCoords },
    },
  ];

  // Upload photos for waypoints linked to this track, then add Point features.
  const trackWaypoints = allWaypoints.filter((w) => w.trackId === track.id);
  for (const w of trackWaypoints) {
    let photoUrl: string | null = null;
    if (w.photoUri && Platform.OS !== "web") {
      try {
        photoUrl = await uploadPhoto(w.photoUri);
      } catch {
        // Best-effort: publish the waypoint without a photo if upload fails.
      }
    }
    features.push({
      type: "Feature",
      properties: {
        _waypointMarker: true,
        name: w.name,
        notes: w.notes ?? null,
        photoUrl,
      },
      geometry: { type: "Point", coordinates: [w.longitude, w.latitude] },
    });
  }

  return shareCommunityDataset({
    name: track.name,
    description: meta.description ?? track.description ?? null,
    format: "geojson",
    author: meta.author ?? null,
    geojson: { type: "FeatureCollection", features },
  });
}

/**
 * Publish an array of already-parsed datasets to the community library in
 * parallel batches. Up to 20 datasets per HTTP request, 3 requests in flight
 * at once — fast enough for 1,500+ files.
 *
 * `onProgress(processed, total, failed)` is called after each batch lands.
 */
export async function bulkShareCommunityDatasets(
  datasets: Array<{
    name: string;
    description?: string | null;
    format: "geojson" | "kml" | "kmz" | "gpx";
    author?: string | null;
    geojson: GeoJSONFeatureCollection;
  }>,
  onProgress?: (processed: number, total: number, failed: number) => void,
): Promise<{ succeeded: number; failed: number }> {
  const BATCH_SIZE = 20;
  const MAX_BATCH_BYTES = 7.5 * 1024 * 1024;
  const CONCURRENCY = 3;

  const batches: (typeof datasets)[] = [];
  let batch: typeof datasets = [];
  let batchBytes = 0;
  for (const dataset of datasets) {
    const bytes = new TextEncoder().encode(JSON.stringify(dataset)).length;
    if (batch.length && (batch.length >= BATCH_SIZE || batchBytes + bytes > MAX_BATCH_BYTES)) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(dataset);
    batchBytes += bytes;
  }
  if (batch.length) batches.push(batch);

  let processed = 0;
  let failed = 0;
  const total = datasets.length;

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const responses = await Promise.all(
      chunk.map((batch) =>
        SecureStore.getItemAsync(AUTH_TOKEN_KEY).then(async (token) => {
          if (!token) throw new Error("Sign in before publishing multiple routes.");
          for (let attempt = 0; attempt < 2; attempt++) {
            const response = await fetch(`${apiBase()}/community/datasets/bulk`, {
              method: "POST",
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ datasets: batch }),
            });
            if (response.status === 429 && attempt === 0) {
              const retrySeconds = Math.min(
                Math.max(Number(response.headers.get("Retry-After")) || 60, 1),
                60,
              );
              await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
              continue;
            }
            if (!response.ok) {
              const payload = await response.json().catch(() => ({})) as { error?: string };
              throw new Error(payload.error || `Request failed: ${response.status}`);
            }
            return await response.json() as {
              results: Array<{ success: boolean; error?: string | null }>;
            };
          }
          throw new Error("Bulk upload could not be completed.");
        }).catch((err: unknown) => ({
          results: batch.map(() => ({
            success: false as const,
            error: err instanceof Error ? err.message : "Network error",
          })),
        })),
      ),
    );
    for (const r of responses) {
      for (const item of r.results) {
        processed++;
        if (!item.success) failed++;
      }
    }
    onProgress?.(processed, total, failed);
  }

  return { succeeded: processed - failed, failed };
}

// ---------------------------------------------------------------------------
// USGS National Digital Trails
// ---------------------------------------------------------------------------

export type UsgsImportProgress = {
  done: number;
  total: number;
};

/**
 * Fire-and-forget: ask the server to import USGS National Digital Trails for
 * the given US state. Returns immediately — poll getUsgsStateStatus to know
 * when it's done.
 */
export function syncUsgsState(
  state: string,
): Promise<{ status: "started" | "in_progress" | "exists"; state: string }> {
  return jsonFetch<{ status: "started" | "in_progress" | "exists"; state: string }>(
    "/community/usgs/sync-state",
    { method: "POST", jsonBody: { state } },
  );
}

/**
 * Poll the USGS import progress for the given state.
 */
export function getUsgsStateStatus(state: string): Promise<{
  state: string;
  inProgress: boolean;
  progress: UsgsImportProgress | null;
}> {
  return jsonFetch<{
    state: string;
    inProgress: boolean;
    progress: UsgsImportProgress | null;
  }>(`/community/usgs/sync-state/status?state=${encodeURIComponent(state)}`);
}

/**
 * Resolve the community-dataset id that backs a published trail-guide slug.
 * The server endpoint GET /api/trail-guides/:slug/source returns
 * `{ datasetId: string }` when the guide is published, or 404 when it is not.
 * Throws on network / server errors so the caller can handle them safely.
 */
export function getTrailGuideSource(
  slug: string,
): Promise<{ datasetId: string }> {
  return jsonFetch<{ datasetId: string }>(
    `/trail-guides/${encodeURIComponent(slug)}/source`,
  );
}

export function generateBlogPost(
  datasetId: string,
  input: {
    units?: "metric" | "imperial";
    distanceMeters?: number | null;
    elevationGainMeters?: number | null;
    centerLat?: number | null;
    centerLng?: number | null;
    author?: string | null;
    imageUrls: string[];
    imageCaptions?: (string | null)[];
    fieldNotes?: string[];
  },
): Promise<BlogPost> {
  return jsonFetch<BlogPost>(`/community/datasets/${datasetId}/blog`, {
    method: "POST",
    jsonBody: input,
  });
}
