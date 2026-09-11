import assert from "node:assert/strict";
import test from "node:test";
import { toPersistedLiveSession } from "./liveSessionPersistence";
import {
  MAX_LIVE_FOLLOWED_ROUTE_POINTS,
  snapshotFollowedRoute,
} from "./liveRouteSnapshot";
import { mergeLiveSyncResult } from "./liveSyncMerge";
import { liveSyncFailureState } from "./liveSyncStatus";
import type { LiveSession } from "./liveSharing";

const session = (id: string, overrides: Partial<LiveSession> = {}): LiveSession => ({
  id,
  token: "token",
  url: "https://mapper.one/live/token",
  name: "Test",
  ownerDisplayName: "Taylor",
  followedRoute: null,
  status: "active",
  startedAt: 1,
  endedAt: null,
  lastUpdatedAt: null,
  distanceMeters: 0,
  pointCount: 0,
  waypoints: [],
  messages: [],
  pendingPoints: [],
  pendingWaypoints: [],
  pendingMessages: [],
  pendingEnd: false,
  pendingRevoke: false,
  syncState: "up-to-date",
  ...overrides,
});

test("keeps points and terminal intent appended during an in-flight sync", () => {
  const snapshot = session("one", {
    pendingPoints: [{ id: "old", lat: 1, lng: 1, t: 1 }],
  });
  const synced = session("one");
  const latest = session("one", {
    pendingPoints: [
      { id: "old", lat: 1, lng: 1, t: 1 },
      { id: "new", lat: 2, lng: 2, t: 2 },
    ],
    pendingMessages: [{ id: "message-new", body: "Still moving" }],
    pendingRevoke: true,
  });
  const merged = mergeLiveSyncResult(snapshot, synced, latest);
  assert.deepEqual(merged?.pendingPoints.map((point) => point.id), ["new"]);
  assert.deepEqual(merged?.pendingMessages, [{ id: "message-new", body: "Still moving" }]);
  assert.equal(merged?.pendingRevoke, true);
});

test("does not let an old sync clear a replacement session", () => {
  const replacement = session("new", { pendingRevoke: true });
  assert.equal(
    mergeLiveSyncResult(session("old", { pendingRevoke: true }), null, replacement),
    replacement,
  );
});

test("keeps the device-only owner capability through a queued-point retry", () => {
  const snapshot = session("one", {
    ownerCapability: "owner-capability",
    pendingPoints: [{ id: "pending", lat: 1, lng: 1, t: 1 }],
  });
  const synced = session("one", { ownerCapability: "owner-capability" });
  const merged = mergeLiveSyncResult(snapshot, synced, snapshot);
  assert.equal(merged?.ownerCapability, "owner-capability");
  assert.deepEqual(merged?.pendingPoints, []);
});

test("does not write either live capability to ordinary session storage", () => {
  const persisted = toPersistedLiveSession(
    session("one", {
      token: "viewer-capability",
      url: "https://mapper.one/live/viewer-capability",
      ownerCapability: "owner-capability",
    }),
  );
  assert.equal("token" in persisted, false);
  assert.equal("url" in persisted, false);
  assert.equal("ownerCapability" in persisted, false);
});

test("caps followed-route snapshots while retaining the first and last point", () => {
  const points = Array.from({ length: 1_003 }, (_, index) => ({
    lat: 40 + index / 10_000,
    lng: -105 - index / 10_000,
    t: index,
  }));
  const snapshot = snapshotFollowedRoute({ name: " Long Trail ", points });
  assert.equal(snapshot?.name, "Long Trail");
  assert.ok(snapshot);
  assert.ok(snapshot.points.length <= MAX_LIVE_FOLLOWED_ROUTE_POINTS);
  assert.deepEqual(snapshot.points[0], { lat: 40, lng: -105 });
  assert.deepEqual(snapshot.points.at(-1), {
    lat: 40 + 1_002 / 10_000,
    lng: -105 - 1_002 / 10_000,
  });
  assert.equal(snapshotFollowedRoute(null), null);
});

test("separates rejected owner sync from temporary retry states", () => {
  assert.equal(liveSyncFailureState(Object.assign(new Error("denied"), { status: 401 })), "needs-attention");
  assert.equal(liveSyncFailureState(Object.assign(new Error("busy"), { status: 503 })), "retrying");
  assert.equal(liveSyncFailureState(new Error("network unavailable")), "waiting-for-network");
});