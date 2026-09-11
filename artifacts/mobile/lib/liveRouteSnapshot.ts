import type { Track } from "./types";

export type LiveFollowedRoute = {
  name: string;
  points: Array<{ lat: number; lng: number }>;
};

export const MAX_LIVE_FOLLOWED_ROUTE_POINTS = 500;

/** Keep a share-start route snapshot compact without losing its endpoints. */
export function snapshotFollowedRoute(
  track: Pick<Track, "name" | "points"> | null,
): LiveFollowedRoute | null {
  if (!track || track.points.length < 2) return null;
  const stride = Math.max(
    1,
    Math.ceil(
      (track.points.length - 1) / (MAX_LIVE_FOLLOWED_ROUTE_POINTS - 1),
    ),
  );
  const points = track.points
    .filter(
      (_, index) =>
        index === 0 ||
        index === track.points.length - 1 ||
        index % stride === 0,
    )
    .map((point) => ({ lat: point.lat, lng: point.lng }));
  return points.length >= 2
    ? { name: track.name.trim().slice(0, 120) || "Followed trail", points }
    : null;
}