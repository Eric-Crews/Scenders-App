import type { LiveSession } from "./liveSharing";

/**
 * Preserve mutations that happened after a synchronizer took its snapshot.
 * Session replacement always wins over an older request finishing later.
 */
export function mergeLiveSyncResult(
  snapshot: LiveSession,
  synced: LiveSession | null,
  latest: LiveSession | null,
): LiveSession | null {
  if (!latest) return synced;
  if (latest.id !== snapshot.id) return latest;
  if (!synced) return null;

  const snapshotPointIds = new Set(snapshot.pendingPoints.map((point) => point.id));
  const addedPoints = latest.pendingPoints.filter(
    (point) => !snapshotPointIds.has(point.id),
  );
  const pointIds = new Set<string>();
  const pendingPoints = [...synced.pendingPoints, ...addedPoints].filter((point) => {
    if (pointIds.has(point.id)) return false;
    pointIds.add(point.id);
    return true;
  });
  const snapshotWaypointIds = new Set(
    (snapshot.pendingWaypoints ?? []).map((waypoint) => waypoint.id),
  );
  const addedWaypoints = (latest.pendingWaypoints ?? []).filter(
    (waypoint) => !snapshotWaypointIds.has(waypoint.id),
  );
  const waypointIds = new Set<string>();
  const pendingWaypoints = [
    ...(synced.pendingWaypoints ?? []),
    ...addedWaypoints,
  ].filter((waypoint) => {
    if (waypointIds.has(waypoint.id)) return false;
    waypointIds.add(waypoint.id);
    return true;
  });
  const appendedMessages = latest.pendingMessages.slice(snapshot.pendingMessages.length);
  return {
    ...synced,
    pendingPoints,
    pendingWaypoints,
    pendingMessages: [...synced.pendingMessages, ...appendedMessages],
    pendingEnd: synced.pendingEnd || latest.pendingEnd,
    pendingRevoke: synced.pendingRevoke || latest.pendingRevoke,
  };
}