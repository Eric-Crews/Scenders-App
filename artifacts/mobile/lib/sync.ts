import * as SecureStore from "expo-secure-store";

import type {
  Dataset,
  GeoJSONFeatureCollection,
  OfflineRegion,
  Track,
  TrackSummary,
  Waypoint,
} from "./types";

const AUTH_TOKEN_KEY = "auth_session_token";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function apiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "/api";
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  if (!token) throw new ApiRequestError("Not authenticated", 401);
  return { Authorization: `Bearer ${token}` };
}

export async function authedFetch<T>(
  path: string,
  init?: RequestInit & { jsonBody?: unknown },
): Promise<T> {
  return apiFetch<T>(path, init, await authHeaders());
}

async function apiFetch<T>(
  path: string,
  init: (RequestInit & { jsonBody?: unknown }) | undefined,
  authorizationHeaders?: Record<string, string>,
): Promise<T> {
  const { jsonBody, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authorizationHeaders,
    ...(rest.headers as Record<string, string> | undefined),
  };
  let body = rest.body;
  if (jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(jsonBody);
  }
  const res = await fetch(`${apiBase()}${path}`, { ...rest, headers, body });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error ?? "";
    } catch {
      // ignore
    }
    throw new ApiRequestError(detail || `Sync request failed: ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

/** Request a live sharing operation that does not need an account session. */
export async function anonymousFetch<T>(
  path: string,
  init?: RequestInit & { jsonBody?: unknown },
): Promise<T> {
  return apiFetch<T>(path, init);
}

/**
 * The recording device keeps this capability locally and sends it only as a
 * header for owner operations. It is intentionally never put in a URL or body.
 */
export async function liveOwnerFetch<T>(
  path: string,
  ownerCapability: string,
  init?: RequestInit & { jsonBody?: unknown },
): Promise<T> {
  return apiFetch<T>(path, init, {
    "X-Live-Owner-Capability": ownerCapability,
  });
}

// ---------- Waypoints ----------

type RemoteWaypoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  trackId: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function pullWaypoints(): Promise<Waypoint[]> {
  const rows = await authedFetch<RemoteWaypoint[]>("/me/waypoints");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    notes: r.notes ?? undefined,
    trackId: r.trackId ?? undefined,
    photoUrl: r.photoUrl ?? undefined,
    createdAt: new Date(r.createdAt).getTime(),
    // photoUri is intentionally device-local; photoUrl is the durable reference.
  }));
}

export async function pushWaypoint(w: Waypoint): Promise<void> {
  await authedFetch(`/me/waypoints/${encodeURIComponent(w.id)}`, {
    method: "PUT",
    jsonBody: {
      name: w.name,
      latitude: w.latitude,
      longitude: w.longitude,
      notes: w.notes ?? null,
      trackId: w.trackId ?? null,
      photoUrl: w.photoUrl ?? null,
      createdAt: new Date(w.createdAt).toISOString(),
    },
  });
}

export async function deleteWaypoint(id: string): Promise<void> {
  await authedFetch(`/me/waypoints/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function requestPrivateProjectPhotoUpload(input: {
  name: string;
  size: number;
  contentType: string;
}): Promise<{ uploadURL: string; objectPath: string }> {
  return authedFetch("/me/private-project-photos/upload", {
    method: "POST",
    jsonBody: input,
  });
}

// ---------- Datasets ----------

type RemoteDatasetSummary = {
  id: string;
  name: string;
  format: Dataset["format"];
  color: string;
  visible: boolean;
  featureCount: number;
  sizeBytes: number;
  bounds: [number, number, number, number] | null;
  communityId: string | null;
  importedAt: string;
  updatedAt: string;
};

type RemoteDatasetDetail = RemoteDatasetSummary & {
  geojson: GeoJSONFeatureCollection;
};

export async function pullDatasetSummaries(): Promise<RemoteDatasetSummary[]> {
  return authedFetch<RemoteDatasetSummary[]>("/me/datasets");
}

export async function pullDatasetDetail(id: string): Promise<Dataset> {
  const r = await authedFetch<RemoteDatasetDetail>(
    `/me/datasets/${encodeURIComponent(id)}`,
  );
  return {
    id: r.id,
    name: r.name,
    format: r.format,
    color: r.color,
    visible: r.visible,
    importedAt: new Date(r.importedAt).getTime(),
    bounds: r.bounds ?? undefined,
    communityId: r.communityId ?? undefined,
    geojson: r.geojson,
  };
}

export async function pushDataset(d: Dataset): Promise<void> {
  await authedFetch(`/me/datasets/${encodeURIComponent(d.id)}`, {
    method: "PUT",
    jsonBody: {
      name: d.name,
      format: d.format,
      color: d.color,
      visible: d.visible,
      bounds: d.bounds ?? null,
      communityId: d.communityId ?? null,
      importedAt: new Date(d.importedAt).toISOString(),
      geojson: d.geojson,
    },
  });
}

export async function deleteDataset(id: string): Promise<void> {
  await authedFetch(`/me/datasets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------- Regions ----------

type RemoteRegion = {
  id: string;
  name: string;
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  createdAt: string;
};

export async function pullRegions(): Promise<OfflineRegion[]> {
  const rows = await authedFetch<RemoteRegion[]>("/me/regions");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    bounds: r.bounds,
    minZoom: r.minZoom,
    maxZoom: r.maxZoom,
    tileCount: r.tileCount,
    createdAt: new Date(r.createdAt).getTime(),
  }));
}

export async function pushRegion(r: OfflineRegion): Promise<void> {
  await authedFetch(`/me/regions/${encodeURIComponent(r.id)}`, {
    method: "PUT",
    jsonBody: {
      name: r.name,
      bounds: r.bounds,
      minZoom: r.minZoom,
      maxZoom: r.maxZoom,
      tileCount: r.tileCount,
      createdAt: new Date(r.createdAt).toISOString(),
    },
  });
}

export async function deleteRegion(id: string): Promise<void> {
  await authedFetch(`/me/regions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------- Tracks ----------

type RemoteTrackSummary = {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  kind?: "recorded" | "plotted";
  distanceMeters: number;
  durationMs: number;
  pointCount: number;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  shareToken?: string | null;
  shareVisibility?: "private" | "public" | null;
};

type RemoteTrackDetail = RemoteTrackSummary & {
  points: Track["points"];
};

export async function pullTrackSummaries(): Promise<TrackSummary[]> {
  const rows = await authedFetch<RemoteTrackSummary[]>("/me/tracks");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    color: r.color,
    kind: r.kind ?? "recorded",
    distanceMeters: r.distanceMeters,
    durationMs: r.durationMs,
    pointCount: r.pointCount,
    startedAt: new Date(r.startedAt).getTime(),
    endedAt: new Date(r.endedAt).getTime(),
    createdAt: new Date(r.createdAt).getTime(),
    shareToken: r.shareToken ?? null,
    shareVisibility: r.shareVisibility ?? null,
  }));
}

export async function pullTrackDetail(id: string): Promise<Track> {
  const r = await authedFetch<RemoteTrackDetail>(
    `/me/tracks/${encodeURIComponent(id)}`,
  );
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    color: r.color,
    kind: r.kind ?? "recorded",
    distanceMeters: r.distanceMeters,
    durationMs: r.durationMs,
    pointCount: r.pointCount,
    startedAt: new Date(r.startedAt).getTime(),
    endedAt: new Date(r.endedAt).getTime(),
    createdAt: new Date(r.createdAt).getTime(),
    shareToken: r.shareToken ?? null,
    shareVisibility: r.shareVisibility ?? null,
    points: r.points,
  };
}

export type ShareTrackResult = {
  token: string;
  visibility: "private" | "public";
  url: string;
};

/** Create or update a share link for a track. Returns the public web URL. */
export async function shareTrack(
  id: string,
  visibility: "private" | "public",
): Promise<ShareTrackResult> {
  return authedFetch<ShareTrackResult>(
    `/me/tracks/${encodeURIComponent(id)}/share`,
    { method: "POST", jsonBody: { visibility } },
  );
}

/** Revoke a track's share link so the URL stops resolving. */
export async function unshareTrack(id: string): Promise<void> {
  await authedFetch(`/me/tracks/${encodeURIComponent(id)}/share`, {
    method: "DELETE",
  });
}

export async function pushTrack(t: Track): Promise<void> {
  await authedFetch(`/me/tracks/${encodeURIComponent(t.id)}`, {
    method: "PUT",
    jsonBody: {
      name: t.name,
      description: t.description ?? null,
      color: t.color,
      kind: t.kind ?? "recorded",
      startedAt: new Date(t.startedAt).toISOString(),
      endedAt: new Date(t.endedAt).toISOString(),
      points: t.points,
    },
  });
}

export async function deleteTrack(id: string): Promise<void> {
  await authedFetch(`/me/tracks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
