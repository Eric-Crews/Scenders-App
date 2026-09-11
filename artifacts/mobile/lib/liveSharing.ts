import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { toPersistedLiveSession } from "./liveSessionPersistence";
import { liveSyncFailureState, type LiveSyncState } from "./liveSyncStatus";
import { anonymousFetch, authedFetch, liveOwnerFetch } from "./sync";
import type { TrackPoint, Waypoint } from "./types";
import type { LiveFollowedRoute } from "./liveRouteSnapshot";
export type { LiveFollowedRoute } from "./liveRouteSnapshot";
export { mergeLiveSyncResult } from "./liveSyncMerge";

const SESSION_KEY = "fieldmaps.live-sharing.v1";
const OWNER_CAPABILITY_KEY = "fieldmaps.live-sharing.owner-capability.v1";

const ownerCapabilityStore = {
  get: () =>
    Platform.OS === "web"
      ? Promise.resolve<string | null>(null)
      : SecureStore.getItemAsync(OWNER_CAPABILITY_KEY),
  set: (capability: string) =>
    Platform.OS === "web"
      ? Promise.resolve()
      : SecureStore.setItemAsync(OWNER_CAPABILITY_KEY, capability),
  clear: () =>
    Platform.OS === "web"
      ? Promise.resolve()
      : SecureStore.deleteItemAsync(OWNER_CAPABILITY_KEY),
};

export type LiveMessage = {
  id: string;
  sender: "viewer" | "owner";
  displayName: string | null;
  body: string;
  createdAt: number;
};

export type QueuedLivePoint = TrackPoint & { id: string };
export type QueuedLiveMessage = { id: string; body: string };
export type LiveWaypoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  notes: string | null;
  photoUrl: string | null;
  createdAt: number;
};
export type QueuedLiveWaypoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  notes: string | null;
  t: number;
  photoUri?: string;
  photoPath?: string;
};

export type LiveSession = {
  id: string;
  /** Viewer-link data is available in memory for sharing but is not persisted. */
  token?: string;
  /** Device-only owner capability for anonymous live activity control. */
  ownerCapability?: string;
  url?: string;
  name: string;
  ownerDisplayName: string;
  followedRoute: LiveFollowedRoute | null;
  status: "active" | "completed";
  startedAt: number;
  endedAt: number | null;
  lastUpdatedAt: number | null;
  distanceMeters: number;
  pointCount: number;
  waypoints: LiveWaypoint[];
  messages: LiveMessage[];
  pendingPoints: QueuedLivePoint[];
  pendingWaypoints: QueuedLiveWaypoint[];
  pendingMessages: QueuedLiveMessage[];
  pendingEnd: boolean;
  pendingRevoke: boolean;
  /** Safe sync state for the recorder UI; it never contains a raw server error. */
  syncState: LiveSyncState;
};

type RemoteActivity = {
  id: string;
  token: string;
  ownerCapability?: string;
  url: string;
  name: string;
  ownerDisplayName: string;
  followedRoute: LiveFollowedRoute | null;
  status: "active" | "completed";
  startedAt: string;
  endedAt: string | null;
  lastUpdatedAt: string | null;
  distanceMeters: number;
  pointCount: number;
  waypoints: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    notes: string | null;
    photoUrl: string | null;
    createdAt: string;
  }>;
  messages: Array<{
    id: string;
    sender: "viewer" | "owner";
    displayName?: string | null;
    body: string;
    createdAt: string;
  }>;
};

function toMs(value: string | null): number | null {
  return value ? new Date(value).getTime() : null;
}

function withRemote(local: LiveSession, remote: RemoteActivity): LiveSession {
  return {
    ...local,
    id: remote.id,
    token: remote.token,
    url: remote.url,
    name: remote.name,
    ownerDisplayName: remote.ownerDisplayName || "Recorder",
    followedRoute: remote.followedRoute ?? null,
    status: remote.status,
    startedAt: toMs(remote.startedAt) ?? local.startedAt,
    endedAt: toMs(remote.endedAt),
    lastUpdatedAt: toMs(remote.lastUpdatedAt),
    distanceMeters: remote.distanceMeters,
    pointCount: remote.pointCount,
    waypoints: remote.waypoints.map((waypoint) => ({
      ...waypoint,
      createdAt: new Date(waypoint.createdAt).getTime(),
    })),
    messages: remote.messages.map((message) => ({
      ...message,
      displayName: message.displayName ?? null,
      createdAt: new Date(message.createdAt).getTime(),
    })),
    syncState: "up-to-date",
  };
}

export async function loadLiveSession(): Promise<LiveSession | null> {
  const [raw, secureCapability] = await Promise.all([
    AsyncStorage.getItem(SESSION_KEY),
    ownerCapabilityStore.get(),
  ]);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LiveSession;
    // Move capabilities saved by the earlier session format into secure storage
    // the next time that session is opened.
    const ownerCapability = secureCapability ?? parsed.ownerCapability;
    const pendingMessages = (parsed.pendingMessages ?? []).flatMap((message, index) => {
      if (typeof message === "string") {
        return [{
          id: `legacy-message-${parsed.id}-${index}`,
          body: message,
        }];
      }
      return message?.id && typeof message.body === "string" ? [message] : [];
    });
    const session: LiveSession = {
      ...parsed,
      ...(ownerCapability ? { ownerCapability } : {}),
      ownerDisplayName: parsed.ownerDisplayName || "Recorder",
      followedRoute: parsed.followedRoute ?? null,
      waypoints: parsed.waypoints ?? [],
      pendingWaypoints: parsed.pendingWaypoints ?? [],
      pendingMessages,
      syncState: parsed.syncState ?? "up-to-date",
    };
    if (parsed.ownerCapability || parsed.token || parsed.url) {
      await saveLiveSession(session);
    }
    return session;
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    await ownerCapabilityStore.clear();
    return null;
  }
}

export async function saveLiveSession(session: LiveSession | null): Promise<void> {
  if (session) {
    // The owner secret is a bearer credential and must not be written to
    // ordinary app storage. Viewer-link data is also memory-only.
    await Promise.all([
      AsyncStorage.setItem(
        SESSION_KEY,
        JSON.stringify(toPersistedLiveSession(session)),
      ),
      session.ownerCapability
        ? ownerCapabilityStore.set(session.ownerCapability)
        : ownerCapabilityStore.clear(),
    ]);
  }
  else {
    await Promise.all([
      AsyncStorage.removeItem(SESSION_KEY),
      ownerCapabilityStore.clear(),
    ]);
  }
}

export async function createLiveSession(input: {
  name: string;
  ownerDisplayName: string;
  followedRoute: LiveFollowedRoute | null;
}): Promise<LiveSession> {
  if (Platform.OS === "web") {
    throw new Error("Live sharing is available in the FieldMaps mobile app.");
  }
  const remote = await anonymousFetch<RemoteActivity>("/live-activities", {
    method: "POST",
    jsonBody: input,
  });
  if (!remote.ownerCapability) {
    throw new Error("Live sharing setup did not return a recording-device capability.");
  }
  const initial: LiveSession = {
    id: remote.id,
    token: remote.token,
    ownerCapability: remote.ownerCapability,
    url: remote.url,
    name: remote.name,
    ownerDisplayName: remote.ownerDisplayName || "Recorder",
    followedRoute: remote.followedRoute ?? null,
    status: remote.status,
    startedAt: toMs(remote.startedAt) ?? Date.now(),
    endedAt: toMs(remote.endedAt),
    lastUpdatedAt: toMs(remote.lastUpdatedAt),
    distanceMeters: remote.distanceMeters,
    pointCount: remote.pointCount,
    waypoints: [],
    messages: [],
    pendingPoints: [],
    pendingWaypoints: [],
    pendingMessages: [],
    pendingEnd: false,
    pendingRevoke: false,
    syncState: "up-to-date",
  };
  return withRemote(initial, remote);
}

export function enqueueLivePoint(
  session: LiveSession,
  point: TrackPoint,
): LiveSession {
  const id = `${point.t}-${Math.random().toString(36).slice(2, 12)}`;
  return {
    ...session,
    pendingPoints: [...session.pendingPoints, { ...point, id }],
  };
}

export function enqueueLiveWaypoint(
  session: LiveSession,
  waypoint: Waypoint,
): LiveSession {
  return {
    ...session,
    pendingWaypoints: [
      ...session.pendingWaypoints,
      {
        id: waypoint.id,
        name: waypoint.name,
        lat: waypoint.latitude,
        lng: waypoint.longitude,
        notes: waypoint.notes ?? null,
        t: waypoint.createdAt,
        photoUri: waypoint.photoUri,
      },
    ],
  };
}

function contentTypeForPhoto(uri: string): string {
  const extension = uri.split(".").pop()?.split("?")[0]?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "heic") return "image/heic";
  return "image/jpeg";
}

async function uploadWaypointPhoto(
  ownerFetch: <T>(
    path: string,
    init?: RequestInit & { jsonBody?: unknown },
  ) => Promise<T>,
  sessionId: string,
  uri: string,
): Promise<string> {
  if (Platform.OS === "web") throw new Error("Photo upload is not supported on web.");
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error("Waypoint photo is missing.");
  const contentType = contentTypeForPhoto(uri);
  const upload = await ownerFetch<{ uploadURL: string; photoPath: string }>(
    `/me/live-activities/${encodeURIComponent(sessionId)}/waypoint-photo-upload`,
    {
      method: "POST",
      jsonBody: {
        name: uri.split("/").pop() ?? "waypoint.jpg",
        size: info.size ?? 1,
        contentType,
      },
    },
  );
  const result = await FileSystem.uploadAsync(upload.uploadURL, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Waypoint photo upload failed (${result.status}).`);
  }
  return upload.photoPath;
}

export function enqueueLiveMessage(
  session: LiveSession,
  body: string,
): LiveSession {
  return {
    ...session,
    pendingMessages: [
      ...session.pendingMessages,
      { id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`, body },
    ],
  };
}

/**
 * Drain all safe local work in order. Any failed request leaves the remaining
 * data on the device for the next foreground/timer retry instead of dropping a
 * gap from the recipient route.
 */
export async function syncLiveSession(
  session: LiveSession,
): Promise<LiveSession | null> {
  let next = { ...session };
  // Sessions created before device capabilities existed can still be controlled
  // by their signed-in account. New sessions never require that account.
  const ownerFetch = <T>(
    path: string,
    init?: RequestInit & { jsonBody?: unknown },
  ): Promise<T> =>
    next.ownerCapability
      ? liveOwnerFetch<T>(path, next.ownerCapability, init)
      : authedFetch<T>(path, init);
  try {
    if (next.pendingRevoke) {
      await ownerFetch<void>(`/me/live-activities/${encodeURIComponent(next.id)}/revoke`, {
        method: "POST",
      });
      return null;
    }

    while (next.pendingPoints.length) {
      const batch = next.pendingPoints.slice(0, 100);
      const remote = await ownerFetch<RemoteActivity>(
        `/me/live-activities/${encodeURIComponent(next.id)}/points`,
        { method: "POST", jsonBody: { points: batch } },
      );
      next = withRemote(
        { ...next, pendingPoints: next.pendingPoints.slice(batch.length) },
        remote,
      );
    }

    while (next.pendingWaypoints.length) {
      let waypoint = next.pendingWaypoints[0];
      if (waypoint.photoUri && !waypoint.photoPath) {
        const photoPath = await uploadWaypointPhoto(ownerFetch, next.id, waypoint.photoUri);
        waypoint = { ...waypoint, photoPath };
        next = {
          ...next,
          pendingWaypoints: [waypoint, ...next.pendingWaypoints.slice(1)],
        };
      }
      const remote = await ownerFetch<RemoteActivity>(
        `/me/live-activities/${encodeURIComponent(next.id)}/waypoints`,
        {
          method: "POST",
          jsonBody: {
            id: waypoint.id,
            name: waypoint.name,
            lat: waypoint.lat,
            lng: waypoint.lng,
            notes: waypoint.notes,
            photoPath: waypoint.photoPath ?? null,
            t: waypoint.t,
          },
        },
      );
      next = withRemote(
        { ...next, pendingWaypoints: next.pendingWaypoints.slice(1) },
        remote,
      );
    }

    while (next.pendingMessages.length) {
      const message = next.pendingMessages[0];
      await ownerFetch(
        `/me/live-activities/${encodeURIComponent(next.id)}/messages`,
        {
          method: "POST",
          jsonBody: {
            message: message.body,
            clientMessageId: message.id,
          },
        },
      );
      next = { ...next, pendingMessages: next.pendingMessages.slice(1) };
    }

    if (next.pendingEnd) {
      const remote = await ownerFetch<RemoteActivity>(
        `/me/live-activities/${encodeURIComponent(next.id)}/end`,
        { method: "POST" },
      );
      next = withRemote({ ...next, pendingEnd: false }, remote);
    }

    const remote = await ownerFetch<RemoteActivity>(
      `/me/live-activities/${encodeURIComponent(next.id)}`,
    );
    return withRemote(next, remote);
  } catch (error) {
    return { ...next, syncState: liveSyncFailureState(error) };
  }
}