import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tracksTable } from "@workspace/db";
import {
  GetPrivateProjectRouteResponse,
  GetSharedTrackResponse,
} from "@workspace/api-zod";
import {
  getActivePrivateProjectRoute,
  privateProjectWaypointPhotoUrl,
} from "../lib/privateProjects";
import { rateLimit } from "../middlewares/rateLimit";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const privateProjectReadLimiter = rateLimit({ windowMs: 60_000, max: 60 });
const privateProjectStorage = new ObjectStorageService();

/**
 * Public, unauthenticated read of a shared track by its unguessable token.
 * Both "private" and "public" shares are readable here — privacy is enforced
 * only by token secrecy (private shares are additionally noindex on the web
 * viewer and are not listed in the community library). Mounted under /api but
 * deliberately outside the `requireAuth` gate in routes/me.ts.
 */
router.get("/shared/tracks/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token)
    ? req.params.token[0]
    : req.params.token;
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const [row] = await db
    .select()
    .from(tracksTable)
    .where(eq(tracksTable.shareToken, token));

  if (!row) {
    res.status(404).json({ error: "Shared route not found" });
    return;
  }

  res.json(
    GetSharedTrackResponse.parse({
      name: row.name,
      description: row.description,
      color: row.color,
      kind: row.kind,
      distanceMeters: row.distanceMeters,
      durationMs: row.durationMs,
      pointCount: row.pointCount,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      visibility: row.shareVisibility ?? "private",
      points: row.points,
    }),
  );
});

/**
 * Paid private projects use a separate token space and are only readable while
 * their payment-confirmed access window is active.
 */
router.get(
  "/private-projects/:token",
  privateProjectReadLimiter,
  async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token)
    ? req.params.token[0]
    : req.params.token;
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token) {
    res.status(404).json({ error: "Shared project not found" });
    return;
  }

  const row = await getActivePrivateProjectRoute(token);
  if (!row) {
    res.status(404).json({ error: "Shared project not found" });
    return;
  }

  const track = row.track;
  res.json(
    GetPrivateProjectRouteResponse.parse({
      route: {
        name: track.name,
        description: track.description,
        color: track.color,
        kind: track.kind,
        distanceMeters: track.distanceMeters,
        durationMs: track.durationMs,
        pointCount: track.pointCount,
        startedAt: track.startedAt,
        endedAt: track.endedAt,
        visibility: "private",
        points: track.points,
      },
      waypoints: row.waypoints.map((waypoint) => ({
        id: waypoint.id,
        name: waypoint.name,
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
        notes: waypoint.notes,
        photoUrl: waypoint.photoUrl
          ? privateProjectWaypointPhotoUrl(token, waypoint.id)
          : null,
        createdAt: waypoint.createdAt,
      })),
    }),
  );
  },
);

router.get(
  "/private-projects/:token/waypoints/:waypointId/photo",
  privateProjectReadLimiter,
  async (req, res): Promise<void> => {
    const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
    const waypointId =
      typeof req.params.waypointId === "string" ? req.params.waypointId : "";
    const project = token ? await getActivePrivateProjectRoute(token) : null;
    const waypoint = project?.waypoints.find((item) => item.id === waypointId);
    if (!waypoint?.photoUrl) {
      res.status(404).json({ error: "Shared project photo not found" });
      return;
    }

    try {
      if (!waypoint.photoUrl.startsWith("/objects/")) {
        res.status(404).json({ error: "Shared project photo not found" });
        return;
      }
      const file = await privateProjectStorage.getObjectEntityFile(
        waypoint.photoUrl,
      );
      const source = await privateProjectStorage.downloadObject(file, 0);
      const contentType = source.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) {
        res.status(404).json({ error: "Shared project photo not found" });
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Type", contentType);
      res.send(Buffer.from(await source.arrayBuffer()));
    } catch {
      res.status(404).json({ error: "Shared project photo not found" });
    }
  },
);

export default router;
