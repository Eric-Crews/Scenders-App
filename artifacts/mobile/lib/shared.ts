import type { Track, TrackPoint } from "./types";
import {
  fetchPrivateProjectRoute,
  type PrivateProjectContent,
} from "./privateProjects";
import { mobileApiBase } from "./api-base";

function apiBase(): string {
  return mobileApiBase();
}

export type SharedTrack = {
  name: string;
  description: string | null;
  color: string;
  kind: "recorded" | "plotted";
  distanceMeters: number;
  durationMs: number;
  pointCount: number;
  startedAt: string;
  endedAt: string;
  visibility: "private" | "public";
  points: TrackPoint[];
};

/**
 * Fetch a shared route by its public token. No authentication — anyone holding
 * the link can read it. Used by the in-app deep-link viewer (app/share/[token]).
 */
export async function fetchSharedTrack(token: string): Promise<SharedTrack> {
  const res = await fetch(
    `${apiBase()}/shared/tracks/${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error ?? "";
    } catch {
      // ignore
    }
    throw new Error(detail || `Couldn't load route: ${res.status}`);
  }
  return (await res.json()) as SharedTrack;
}

export async function fetchSharedPrivateProject(
  token: string,
): Promise<PrivateProjectContent> {
  return fetchPrivateProjectRoute(token);
}

/**
 * Convert a fetched shared route into a local Track shape (minus id/createdAt)
 * so it can be saved via MapsContext.addTrack.
 */
export function sharedToTrackInput(
  s: SharedTrack,
): Omit<Track, "id" | "createdAt"> {
  return {
    name: s.name,
    description: s.description,
    color: s.color,
    kind: s.kind,
    distanceMeters: s.distanceMeters,
    durationMs: s.durationMs,
    pointCount: s.pointCount,
    startedAt: new Date(s.startedAt).getTime(),
    endedAt: new Date(s.endedAt).getTime(),
    points: s.points,
  };
}
