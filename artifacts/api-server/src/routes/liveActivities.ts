import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  db,
  liveActivitiesTable,
  liveActivityMessagesTable,
  liveActivityPointsTable,
  liveActivityWaypointsTable,
  type LiveActivityRow,
} from "@workspace/db";
import {
  CreateMyLiveActivityBody,
  EndMyLiveActivityResponse,
  GetMyLiveActivityResponse,
  GetSharedLiveActivityResponse,
  SendMyLiveActivityMessageBody,
  SendSharedLiveActivityMessageBody,
  UploadMyLiveActivityPointsBody,
  UploadMyLiveActivityWaypointBody,
  RequestMyLiveActivityWaypointPhotoUploadBody,
  RequestMyLiveActivityWaypointPhotoUploadResponse,
} from "@workspace/api-zod";
import { rateLimit } from "../middlewares/rateLimit";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const publicReadLimiter = rateLimit({ windowMs: 60_000, max: 90 });
const publicMessageLimiter = rateLimit({ windowMs: 15 * 60_000, max: 8 });
const createLiveLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5 });
const LEGACY_OWNER_DISPLAY_NAME = "Recorder";
const liveWaypointStorage = new ObjectStorageService();

type FollowedRouteSnapshot = {
  name: string;
  points: Array<{ lat: number; lng: number }>;
};

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function idParam(req: Request, name: "id" | "token"): string {
  const value = req.params[name];
  return typeof value === "string" ? value.trim() : "";
}

function publicOrigin(): string {
  return process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://mapper.one";
}

function liveUrl(token: string): string {
  return `${publicOrigin()}/live/${encodeURIComponent(token)}`;
}

function liveWaypointPhotoUrl(token: string, waypointId: string): string {
  return `/api/shared/live/${encodeURIComponent(token)}/waypoints/${encodeURIComponent(waypointId)}/photo`;
}

function ownerCapabilityHash(capability: string): string {
  return createHash("sha256").update(capability, "utf8").digest("hex");
}

function requestOwnerCapability(req: Request): string {
  return req.get("X-Live-Owner-Capability")?.trim() ?? "";
}

function matchesOwnerCapability(
  activity: Pick<LiveActivityRow, "ownerCapabilityHash">,
  capability: string,
): boolean {
  if (!activity.ownerCapabilityHash || !capability) return false;
  const expected = Buffer.from(activity.ownerCapabilityHash, "hex");
  const actual = Buffer.from(ownerCapabilityHash(capability), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isAuthorizedOwner(req: Request, activity: LiveActivityRow): boolean {
  if (matchesOwnerCapability(activity, requestOwnerCapability(req))) return true;
  return Boolean(
    req.isAuthenticated() &&
      activity.ownerId &&
      req.user?.id &&
      activity.ownerId === req.user.id,
  );
}

function durationMs(row: LiveActivityRow): number {
  return Math.max(0, (row.endedAt ?? new Date()).getTime() - row.startedAt.getTime());
}

function toPoint(row: typeof liveActivityPointsTable.$inferSelect) {
  return {
    lat: row.latitude,
    lng: row.longitude,
    t: row.capturedAt.getTime(),
    alt: row.altitude,
    acc: row.accuracy,
  };
}

function toMessage(row: typeof liveActivityMessagesTable.$inferSelect) {
  return {
    id: row.id,
    sender: row.sender as "viewer" | "owner",
    displayName: row.displayName ?? null,
    body: row.body,
    createdAt: row.createdAt,
  };
}

function toWaypoint(
  row: typeof liveActivityWaypointsTable.$inferSelect,
  token: string,
) {
  return {
    id: row.id,
    name: row.name,
    lat: row.latitude,
    lng: row.longitude,
    notes: row.notes,
    photoUrl: row.photoPath ? liveWaypointPhotoUrl(token, row.id) : null,
    createdAt: row.capturedAt,
  };
}

function cleanDisplayName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 80)
    : fallback;
}

function normalizeFollowedRoute(value: unknown): FollowedRouteSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const route = value as { name?: unknown; points?: unknown };
  if (!Array.isArray(route.points) || route.points.length < 2 || route.points.length > 500) {
    return null;
  }
  const points = route.points.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const { lat, lng } = point as { lat?: unknown; lng?: unknown };
    return typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
      ? [{ lat, lng }]
      : [];
  });
  if (points.length !== route.points.length) return null;
  return {
    name: cleanDisplayName(route.name, "Followed trail").slice(0, 120),
    points,
  };
}

async function activityPoints(activityId: string) {
  return db
    .select()
    .from(liveActivityPointsTable)
    .where(eq(liveActivityPointsTable.activityId, activityId))
    .orderBy(asc(liveActivityPointsTable.capturedAt), asc(liveActivityPointsTable.id));
}

async function activityWaypoints(activityId: string) {
  return db
    .select()
    .from(liveActivityWaypointsTable)
    .where(eq(liveActivityWaypointsTable.activityId, activityId))
    .orderBy(
      asc(liveActivityWaypointsTable.capturedAt),
      asc(liveActivityWaypointsTable.id),
    );
}

function publicShape(
  row: LiveActivityRow,
  points: Array<typeof liveActivityPointsTable.$inferSelect>,
  messages: Array<typeof liveActivityMessagesTable.$inferSelect>,
  waypoints: Array<typeof liveActivityWaypointsTable.$inferSelect>,
) {
  const mapped = points.map(toPoint);
  const last = mapped.at(-1);
  return {
    name: row.name,
    ownerDisplayName: cleanDisplayName(
      row.ownerDisplayName,
      LEGACY_OWNER_DISPLAY_NAME,
    ),
    followedRoute: normalizeFollowedRoute(row.followedRoute),
    status: row.status as "active" | "completed",
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    lastUpdatedAt: row.lastUpdatedAt,
    distanceMeters: row.distanceMeters,
    durationMs: durationMs(row),
    pointCount: row.pointCount,
    points: mapped,
    lastLocation: last ? { lat: last.lat, lng: last.lng, t: last.t } : null,
    waypoints: waypoints.map((waypoint) => toWaypoint(waypoint, row.token)),
    messages: messages.map(toMessage),
  };
}

async function ownerShape(row: LiveActivityRow, ownerCapability?: string) {
  const [points, messages, waypoints] = await Promise.all([
    activityPoints(row.id),
    db
      .select()
      .from(liveActivityMessagesTable)
      .where(eq(liveActivityMessagesTable.activityId, row.id))
      .orderBy(asc(liveActivityMessagesTable.createdAt)),
    activityWaypoints(row.id),
  ]);
  return {
    ...publicShape(row, points, messages, waypoints),
    id: row.id,
    token: row.token,
    url: liveUrl(row.token),
    queuedPointCount: 0,
    ...(ownerCapability ? { ownerCapability } : {}),
  };
}

async function ownerActivity(id: string, req: Request) {
  const [row] = await db
    .select()
    .from(liveActivitiesTable)
    .where(eq(liveActivitiesTable.id, id))
    .limit(1);
  return row && isAuthorizedOwner(req, row) ? row : null;
}

export async function getPublicLiveActivity(token: string) {
  if (!token || token.length < 32) return null;
  return db.transaction(async (tx) => {
    // Revocation uses this same row lock. Recheck status after acquiring it so
    // a capability request never returns points after revocation commits.
    await tx.execute(sql`
      select id from ${liveActivitiesTable}
      where ${liveActivitiesTable.token} = ${token}
      for update
    `);
    const [activity] = await tx
      .select()
      .from(liveActivitiesTable)
      .where(eq(liveActivitiesTable.token, token))
      .limit(1);
    if (
      !activity ||
      (activity.status !== "active" && activity.status !== "completed")
    ) {
      return null;
    }
    const [points, messages, waypoints] = await Promise.all([
      tx
        .select()
        .from(liveActivityPointsTable)
        .where(eq(liveActivityPointsTable.activityId, activity.id))
        .orderBy(asc(liveActivityPointsTable.capturedAt), asc(liveActivityPointsTable.id)),
      tx
        .select()
        .from(liveActivityMessagesTable)
        .where(eq(liveActivityMessagesTable.activityId, activity.id))
        .orderBy(asc(liveActivityMessagesTable.createdAt)),
      tx
        .select()
        .from(liveActivityWaypointsTable)
        .where(eq(liveActivityWaypointsTable.activityId, activity.id))
        .orderBy(
          asc(liveActivityWaypointsTable.capturedAt),
          asc(liveActivityWaypointsTable.id),
        ),
    ]);
    return publicShape(activity, points, messages, waypoints);
  });
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

function distanceForPoints(points: Array<typeof liveActivityPointsTable.$inferSelect>): number {
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    distance += haversineMeters(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude,
    );
  }
  return distance;
}

async function createLiveActivity(
  req: Request,
  res: Response,
  ownerId?: string,
): Promise<void> {
  const parsed = CreateMyLiveActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid activity name and display name." });
    return;
  }
  const name = parsed.data.name.trim();
  const ownerDisplayName = parsed.data.ownerDisplayName?.trim();
  const followedRoute = parsed.data.followedRoute
    ? normalizeFollowedRoute(parsed.data.followedRoute)
    : null;
  if (
    !name ||
    (parsed.data.ownerDisplayName !== undefined && !ownerDisplayName) ||
    (parsed.data.followedRoute && !followedRoute)
  ) {
    res.status(400).json({ error: "Enter a valid activity name and display name." });
    return;
  }

  const id = randomUUID();
  // The viewer receives token through the private link. This separate
  // capability is returned only to the recording device and is never logged.
  const token = randomBytes(32).toString("base64url");
  const ownerCapability = randomBytes(32).toString("base64url");
  const [createdActivity] = await db
    .insert(liveActivitiesTable)
    .values({
      id,
      ownerId,
      ownerCapabilityHash: ownerCapabilityHash(ownerCapability),
      token,
      name,
      ownerDisplayName: ownerDisplayName || LEGACY_OWNER_DISPLAY_NAME,
      followedRoute,
      status: "active",
    })
    .returning();
  req.log?.info({ activityId: id }, "Live activity private link created");
  res
    .status(201)
    .json(GetMyLiveActivityResponse.parse(await ownerShape(createdActivity, ownerCapability)));
}

router.post("/me/live-activities", requireAuth, createLiveLimiter, (req, res) =>
  createLiveActivity(req, res, req.user!.id),
);

router.post("/live-activities", createLiveLimiter, (req, res) =>
  createLiveActivity(req, res),
);

router.get("/me/live-activities/:id", async (req, res): Promise<void> => {
  const activity = await ownerActivity(idParam(req, "id"), req);
  if (!activity || activity.status === "revoked") {
    res.status(404).json({ error: "Live activity not found" });
    return;
  }
  res.json(GetMyLiveActivityResponse.parse(await ownerShape(activity)));
});

router.post("/me/live-activities/:id/points", async (req, res): Promise<void> => {
  const parsed = UploadMyLiveActivityPointsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid point batch" });
    return;
  }
  const points = parsed.data.points;
  if (
    points.some(
      (point) =>
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lng) ||
        !Number.isFinite(point.t) ||
        point.t < 0 ||
        point.t > Date.now() + 24 * 60 * 60_000,
    )
  ) {
    res.status(400).json({ error: "Invalid point batch" });
    return;
  }
  const id = idParam(req, "id");
  const result = await db.transaction(async (tx) => {
    // Terminal transitions acquire the same row lock. That makes the accepted
    // point set and its completed/revoked state one coherent operation.
    await tx.execute(sql`
      select id from ${liveActivitiesTable}
      where ${liveActivitiesTable.id} = ${id}
      for update
    `);
    const [activity] = await tx
      .select()
      .from(liveActivitiesTable)
      .where(eq(liveActivitiesTable.id, id))
      .limit(1);
    if (!activity || !isAuthorizedOwner(req, activity) || activity.status === "revoked") {
      return { kind: "missing" as const };
    }
    if (activity.status !== "active") return { kind: "ended" as const };

    await tx
      .insert(liveActivityPointsTable)
      .values(
        points.map((point) => ({
          id: randomUUID(),
          activityId: activity.id,
          clientPointId: point.id,
          latitude: point.lat,
          longitude: point.lng,
          capturedAt: new Date(point.t),
          altitude: point.alt ?? null,
          accuracy: point.acc ?? null,
        })),
      )
      .onConflictDoNothing({
        target: [liveActivityPointsTable.activityId, liveActivityPointsTable.clientPointId],
      });
    const stored = await tx
      .select()
      .from(liveActivityPointsTable)
      .where(eq(liveActivityPointsTable.activityId, activity.id))
      .orderBy(asc(liveActivityPointsTable.capturedAt), asc(liveActivityPointsTable.id));
    const [updated] = await tx
      .update(liveActivitiesTable)
      .set({
        distanceMeters: distanceForPoints(stored),
        pointCount: stored.length,
        lastUpdatedAt: stored.length ? new Date() : activity.lastUpdatedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(liveActivitiesTable.id, activity.id), eq(liveActivitiesTable.status, "active")))
      .returning();
    return { kind: "ok" as const, activity: updated };
  });
  if (result.kind === "missing") {
    res.status(404).json({ error: "Live activity not found" });
    return;
  }
  if (result.kind === "ended") {
    res.status(400).json({ error: "This activity has ended and no longer accepts location updates." });
    return;
  }
  res.json(GetMyLiveActivityResponse.parse(await ownerShape(result.activity)));
});

router.post(
  "/me/live-activities/:id/waypoint-photo-upload",
  async (req, res): Promise<void> => {
    const parsed = RequestMyLiveActivityWaypointPhotoUploadBody.safeParse(req.body);
    const activity = await ownerActivity(idParam(req, "id"), req);
    if (!activity || activity.status !== "active") {
      res.status(404).json({ error: "Live activity not found" });
      return;
    }
    if (!parsed.success || !parsed.data.contentType.startsWith("image/")) {
      res.status(400).json({ error: "Waypoint photos must be images." });
      return;
    }
    try {
      const uploadURL = await liveWaypointStorage.getObjectEntityUploadURL(
        `live-activity-photos/${activity.id}`,
      );
      const photoPath = liveWaypointStorage.normalizeObjectEntityPath(uploadURL);
      res.json(
        RequestMyLiveActivityWaypointPhotoUploadResponse.parse({
          uploadURL,
          photoPath,
        }),
      );
    } catch (error) {
      req.log?.error({ err: error, activityId: activity.id }, "Live waypoint photo upload unavailable");
      res.status(503).json({ error: "Couldn't prepare the waypoint photo upload." });
    }
  },
);

router.post("/me/live-activities/:id/waypoints", async (req, res): Promise<void> => {
  const parsed = UploadMyLiveActivityWaypointBody.safeParse(req.body);
  const activity = await ownerActivity(idParam(req, "id"), req);
  if (!activity || activity.status !== "active") {
    res.status(404).json({ error: "Live activity not found" });
    return;
  }
  const waypoint = parsed.success ? parsed.data : null;
  const name = waypoint?.name.trim() ?? "";
  const notes = waypoint?.notes?.trim() || null;
  const photoPath = waypoint?.photoPath ?? null;
  const activityPhotoPrefix = `/objects/live-activity-photos/${activity.id}/`;
  if (
    !waypoint ||
    !name ||
    !Number.isFinite(waypoint.t) ||
    waypoint.t < 0 ||
    waypoint.t > Date.now() + 24 * 60 * 60_000 ||
    (photoPath !== null && !photoPath.startsWith(activityPhotoPrefix))
  ) {
    res.status(400).json({ error: "Invalid live waypoint." });
    return;
  }

  await db
    .insert(liveActivityWaypointsTable)
    .values({
      id: randomUUID(),
      activityId: activity.id,
      clientWaypointId: waypoint.id.trim(),
      name,
      latitude: waypoint.lat,
      longitude: waypoint.lng,
      notes,
      photoPath,
      capturedAt: new Date(waypoint.t),
    })
    .onConflictDoNothing({
      target: [
        liveActivityWaypointsTable.activityId,
        liveActivityWaypointsTable.clientWaypointId,
      ],
    });
  res.status(201).json(GetMyLiveActivityResponse.parse(await ownerShape(activity)));
});

router.post("/me/live-activities/:id/messages", async (req, res): Promise<void> => {
  const parsed = SendMyLiveActivityMessageBody.safeParse(req.body);
  const activity = await ownerActivity(idParam(req, "id"), req);
  const body = parsed.success ? parsed.data.message.trim() : "";
  const clientMessageId = parsed.success
    ? parsed.data.clientMessageId.trim()
    : undefined;
  if (!activity || activity.status === "revoked") {
    res.status(404).json({ error: "Live activity not found" });
    return;
  }
  if (!body) {
    res.status(400).json({ error: "Message cannot be empty." });
    return;
  }
  if (!clientMessageId) {
    res.status(400).json({ error: "Message is missing its device delivery id." });
    return;
  }
  const [inserted] = await db
    .insert(liveActivityMessagesTable)
    .values({
      id: randomUUID(),
      activityId: activity.id,
      sender: "owner",
      clientMessageId,
      body,
    })
    .onConflictDoNothing({
      target: [
        liveActivityMessagesTable.activityId,
        liveActivityMessagesTable.clientMessageId,
      ],
    })
    .returning();
  const message = inserted ?? (await db
    .select()
    .from(liveActivityMessagesTable)
    .where(
      and(
        eq(liveActivityMessagesTable.activityId, activity.id),
        eq(liveActivityMessagesTable.clientMessageId, clientMessageId),
      ),
    )
    .limit(1))[0];
  if (!message) {
    res.status(503).json({ error: "Message could not be confirmed. Please retry." });
    return;
  }
  res.status(201).json(toMessage(message));
});

router.post("/me/live-activities/:id/end", async (req, res): Promise<void> => {
  const id = idParam(req, "id");
  const ended = await db.transaction(async (tx) => {
    await tx.execute(sql`
      select id from ${liveActivitiesTable}
      where ${liveActivitiesTable.id} = ${id}
      for update
    `);
    const [activity] = await tx
      .select()
      .from(liveActivitiesTable)
      .where(eq(liveActivitiesTable.id, id))
      .limit(1);
    if (!activity || !isAuthorizedOwner(req, activity) || activity.status === "revoked") {
      return null;
    }
    const [updated] = await tx
      .update(liveActivitiesTable)
      .set(
        activity.status === "completed"
          ? { updatedAt: new Date() }
          : { status: "completed", endedAt: new Date(), updatedAt: new Date() },
      )
      .where(eq(liveActivitiesTable.id, activity.id))
      .returning();
    return updated;
  });
  if (!ended) {
    res.status(404).json({ error: "Live activity not found" });
    return;
  }
  res.json(EndMyLiveActivityResponse.parse(await ownerShape(ended)));
});

router.post("/me/live-activities/:id/revoke", async (req, res): Promise<void> => {
  const id = idParam(req, "id");
  const revoked = await db.transaction(async (tx) => {
    await tx.execute(sql`
      select id from ${liveActivitiesTable}
      where ${liveActivitiesTable.id} = ${id}
      for update
    `);
    const [activity] = await tx
      .select()
      .from(liveActivitiesTable)
      .where(eq(liveActivitiesTable.id, id))
      .limit(1);
    if (!activity || !isAuthorizedOwner(req, activity)) return false;
    await tx
      .update(liveActivitiesTable)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(liveActivitiesTable.id, activity.id));
    return true;
  });
  if (!revoked) {
    res.status(404).json({ error: "Live activity not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/shared/live/:token", publicReadLimiter, async (req, res): Promise<void> => {
  const activity = await getPublicLiveActivity(idParam(req, "token"));
  if (!activity) {
    res.status(404).json({ error: "Live activity not found" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.json(GetSharedLiveActivityResponse.parse(activity));
});

router.get(
  "/shared/live/:token/waypoints/:waypointId/photo",
  publicReadLimiter,
  async (req, res): Promise<void> => {
    const token = idParam(req, "token");
    const waypointId =
      typeof req.params.waypointId === "string" ? req.params.waypointId : "";
    const activity = await getPublicLiveActivity(token);
    const waypoint = activity?.waypoints.find((item) => item.id === waypointId);
    if (!waypoint?.photoUrl) {
      res.status(404).json({ error: "Shared waypoint photo not found" });
      return;
    }
    const [row] = await db
      .select({ photoPath: liveActivityWaypointsTable.photoPath })
      .from(liveActivityWaypointsTable)
      .innerJoin(
        liveActivitiesTable,
        eq(liveActivityWaypointsTable.activityId, liveActivitiesTable.id),
      )
      .where(
        and(
          eq(liveActivityWaypointsTable.id, waypointId),
          eq(liveActivitiesTable.token, token),
        ),
      )
      .limit(1);
    if (!row?.photoPath) {
      res.status(404).json({ error: "Shared waypoint photo not found" });
      return;
    }
    try {
      const file = await liveWaypointStorage.getObjectEntityFile(row.photoPath);
      const source = await liveWaypointStorage.downloadObject(file, 0);
      const contentType = source.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) {
        res.status(404).json({ error: "Shared waypoint photo not found" });
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Type", contentType);
      res.send(Buffer.from(await source.arrayBuffer()));
    } catch {
      res.status(404).json({ error: "Shared waypoint photo not found" });
    }
  },
);

router.post(
  "/shared/live/:token/messages",
  publicMessageLimiter,
  async (req, res): Promise<void> => {
    const parsed = SendSharedLiveActivityMessageBody.safeParse(req.body);
    const body = parsed.success ? parsed.data.message.trim() : "";
    const displayName = parsed.success ? parsed.data.displayName.trim() : "";
    const token = idParam(req, "token");
    if (!body || !displayName) {
      res.status(400).json({ error: "Message cannot be empty." });
      return;
    }
    const now = new Date();
    const message = await db.transaction(async (tx) => {
      // A recipient message and a terminal transition must share one activity
      // lock, otherwise a message could slip in after view-only/revoked state.
      await tx.execute(sql`
        select id from ${liveActivitiesTable}
        where ${liveActivitiesTable.token} = ${token}
          and ${liveActivitiesTable.status} = 'active'
        for update
      `);
      const [activity] = await tx
        .select()
        .from(liveActivitiesTable)
        .where(and(eq(liveActivitiesTable.token, token), eq(liveActivitiesTable.status, "active")))
        .limit(1);
      if (!activity) return null;
      const [created] = await tx
        .insert(liveActivityMessagesTable)
        .values({
          id: randomUUID(),
          activityId: activity.id,
          sender: "viewer",
          displayName,
          body,
          createdAt: now,
        })
        .returning();
      return created;
    });
    if (!message) {
      res.status(404).json({ error: "Live activity not found" });
      return;
    }
    // Never log message text or a token-derived identifier.
    res.status(201).json({ accepted: true, createdAt: now });
  },
);

export default router;