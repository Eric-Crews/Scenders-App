import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  waypointsTable,
  userDatasetsTable,
  offlineRegionsTable,
  tracksTable,
  privateProjectsTable,
  usersTable,
} from "@workspace/db";
import {
  UpsertMyWaypointBody as WaypointInput,
  UpsertMyDatasetBody as UserDatasetInput,
  UpsertMyRegionBody as UserOfflineRegionInput,
  UpsertMyTrackBody as TrackInput,
  ShareMyTrackBody as ShareTrackInput,
  ListMyWaypointsResponseItem,
  ListMyDatasetsResponseItem,
  ListMyRegionsResponseItem,
  ListMyTracksResponseItem,
  GetMyDatasetResponse,
  GetMyTrackResponse,
  UpsertMyWaypointResponse,
  UpsertMyDatasetResponse,
  UpsertMyRegionResponse,
  UpsertMyTrackResponse,
  ShareMyTrackResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  ListMyTrackPrivateProjectsResponse,
  CreatePrivateProjectCheckoutBody,
  CreatePrivateProjectCheckoutResponse,
  GetMyPrivateProjectResponse,
  ConfirmMyPrivateProjectBody,
  ConfirmMyPrivateProjectResponse,
  GetBetaPrivateSharingAccessResponse,
  CreateBetaPrivateProjectResponse,
} from "@workspace/api-zod";
import {
  activatePrivateProjectFromCheckoutSession,
  createBetaPrivateProject,
  createPrivateProjectCheckout,
  isBetaPrivateSharingAllowed,
  toPrivateProjectView,
} from "../lib/privateProjects";
import { ObjectStorageService } from "../lib/objectStorage";
import { checkoutUnavailableMessage } from "../lib/stripeClient";

/**
 * Canonical public origin for user-facing share links. We pin to the branded
 * mapper.one domain (or PUBLIC_SITE_URL override) rather than the per-env Replit
 * host so a link a user sends a friend is always the nice domain — matching the
 * pattern in routes/donate.ts.
 */
function shareOrigin(): string {
  return (
    process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "https://mapper.one"
  );
}

const router: IRouter = Router();
const privateProjectStorage = new ObjectStorageService();

function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use("/me", requireAuth);

async function betaPrivateSharingEnabledForUser(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return isBetaPrivateSharingAllowed(user?.email ?? null);
}

router.get("/me/beta/private-sharing", async (req, res): Promise<void> => {
  const enabled = await betaPrivateSharingEnabledForUser(req.user!.id);
  res.json(GetBetaPrivateSharingAccessResponse.parse({ enabled }));
});

router.post("/me/private-project-photos/upload", async (req, res): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid upload metadata" });
    return;
  }
  try {
    const { name, size, contentType } = parsed.data;
    if (!contentType.startsWith("image/")) {
      res.status(400).json({ error: "Private project photos must be images" });
      return;
    }
    const uploadURL = await privateProjectStorage.getObjectEntityUploadURL(
      "private-project-photos",
    );
    const objectPath = privateProjectStorage.normalizeObjectEntityPath(uploadURL);
    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to create private project photo upload URL");
    res.status(500).json({ error: "Couldn't prepare private photo upload" });
  }
});

function paramId(req: Request): string | null {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

// ---------- Waypoints ----------

router.get("/me/waypoints", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const rows = await db
    .select()
    .from(waypointsTable)
    .where(eq(waypointsTable.userId, uid))
    .orderBy(desc(waypointsTable.createdAt));
  res.json(rows.map((r) => ListMyWaypointsResponseItem.parse(r)));
});

router.put("/me/waypoints/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = WaypointInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, latitude, longitude, notes, trackId, photoUrl, createdAt } =
    parsed.data;
  if (trackId) {
    const [ownedTrack] = await db
      .select({ id: tracksTable.id })
      .from(tracksTable)
      .where(and(eq(tracksTable.id, trackId), eq(tracksTable.userId, uid)))
      .limit(1);
    if (!ownedTrack) {
      res.status(400).json({ error: "Track not found" });
      return;
    }
  }
  const values = {
    id,
    userId: uid,
    name,
    latitude,
    longitude,
    notes: notes ?? null,
    trackId: trackId ?? null,
    photoUrl: photoUrl ?? null,
    ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
  };
  const [row] = await db
    .insert(waypointsTable)
    .values(values)
    .onConflictDoUpdate({
      target: waypointsTable.id,
      set: {
        name,
        latitude,
        longitude,
        notes: notes ?? null,
        trackId: trackId ?? null,
        photoUrl: photoUrl ?? null,
        updatedAt: new Date(),
      },
      where: eq(waypointsTable.userId, uid),
    })
    .returning();
  res.json(UpsertMyWaypointResponse.parse(row));
});

router.delete("/me/waypoints/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(waypointsTable)
    .where(and(eq(waypointsTable.userId, uid), eq(waypointsTable.id, id)));
  res.sendStatus(204);
});

// ---------- Datasets ----------

const DATASET_SUMMARY_COLUMNS = {
  id: userDatasetsTable.id,
  name: userDatasetsTable.name,
  format: userDatasetsTable.format,
  color: userDatasetsTable.color,
  visible: userDatasetsTable.visible,
  featureCount: userDatasetsTable.featureCount,
  sizeBytes: userDatasetsTable.sizeBytes,
  boundsWest: userDatasetsTable.boundsWest,
  boundsSouth: userDatasetsTable.boundsSouth,
  boundsEast: userDatasetsTable.boundsEast,
  boundsNorth: userDatasetsTable.boundsNorth,
  communityId: userDatasetsTable.communityId,
  importedAt: userDatasetsTable.importedAt,
  updatedAt: userDatasetsTable.updatedAt,
};

type DatasetSummaryRow = typeof DATASET_SUMMARY_COLUMNS extends Record<
  string,
  infer _C
>
  ? Record<string, unknown>
  : never;

function toDatasetSummary(row: Record<string, unknown>) {
  const bw = row.boundsWest as number | null;
  const bs = row.boundsSouth as number | null;
  const be = row.boundsEast as number | null;
  const bn = row.boundsNorth as number | null;
  const bounds =
    bw != null && bs != null && be != null && bn != null
      ? [bw, bs, be, bn]
      : null;
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    color: row.color,
    visible: Boolean((row.visible as number) ?? 1),
    featureCount: row.featureCount,
    sizeBytes: row.sizeBytes,
    bounds,
    communityId: row.communityId ?? null,
    importedAt: row.importedAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/me/datasets", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const rows = await db
    .select(DATASET_SUMMARY_COLUMNS)
    .from(userDatasetsTable)
    .where(eq(userDatasetsTable.userId, uid))
    .orderBy(desc(userDatasetsTable.importedAt));
  res.json(
    rows.map((r) =>
      ListMyDatasetsResponseItem.parse(toDatasetSummary(r as DatasetSummaryRow)),
    ),
  );
});

router.get("/me/datasets/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(userDatasetsTable)
    .where(
      and(eq(userDatasetsTable.userId, uid), eq(userDatasetsTable.id, id)),
    );
  if (!row) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }
  res.json(
    GetMyDatasetResponse.parse({
      ...toDatasetSummary(row as unknown as Record<string, unknown>),
      geojson: row.geojson,
    }),
  );
});

router.put("/me/datasets/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UserDatasetInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    name,
    format,
    color,
    visible,
    bounds,
    communityId,
    importedAt,
    geojson,
  } = parsed.data;
  const sizeBytes = Buffer.byteLength(JSON.stringify(geojson), "utf8");
  const featureCount = Array.isArray(
    (geojson as { features?: unknown }).features,
  )
    ? (geojson as { features: unknown[] }).features.length
    : 0;
  const [bw, bs, be, bn] = (bounds ?? [null, null, null, null]) as Array<
    number | null
  >;
  const values = {
    id,
    userId: uid,
    name,
    format,
    color: color ?? "#2f6b46",
    visible: visible === false ? 0 : 1,
    featureCount,
    sizeBytes,
    boundsWest: bw,
    boundsSouth: bs,
    boundsEast: be,
    boundsNorth: bn,
    communityId: communityId ?? null,
    geojson,
    ...(importedAt ? { importedAt: new Date(importedAt) } : {}),
  };
  const [row] = await db
    .insert(userDatasetsTable)
    .values(values)
    .onConflictDoUpdate({
      target: userDatasetsTable.id,
      set: {
        name,
        format,
        color: values.color,
        visible: values.visible,
        featureCount,
        sizeBytes,
        boundsWest: bw,
        boundsSouth: bs,
        boundsEast: be,
        boundsNorth: bn,
        communityId: communityId ?? null,
        geojson,
        updatedAt: new Date(),
      },
      where: eq(userDatasetsTable.userId, uid),
    })
    .returning();
  res.json(
    UpsertMyDatasetResponse.parse(
      toDatasetSummary(row as unknown as Record<string, unknown>),
    ),
  );
});

router.delete("/me/datasets/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(userDatasetsTable)
    .where(
      and(eq(userDatasetsTable.userId, uid), eq(userDatasetsTable.id, id)),
    );
  res.sendStatus(204);
});

// ---------- Offline regions ----------

router.get("/me/regions", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const rows = await db
    .select()
    .from(offlineRegionsTable)
    .where(eq(offlineRegionsTable.userId, uid))
    .orderBy(desc(offlineRegionsTable.createdAt));
  res.json(
    rows.map((r) =>
      ListMyRegionsResponseItem.parse({
        id: r.id,
        name: r.name,
        bounds: [r.boundsWest, r.boundsSouth, r.boundsEast, r.boundsNorth],
        minZoom: r.minZoom,
        maxZoom: r.maxZoom,
        tileCount: r.tileCount,
        createdAt: r.createdAt,
      }),
    ),
  );
});

router.put("/me/regions/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UserOfflineRegionInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, bounds, minZoom, maxZoom, tileCount, createdAt } = parsed.data;
  const [bw, bs, be, bn] = bounds;
  const values = {
    id,
    userId: uid,
    name,
    boundsWest: bw,
    boundsSouth: bs,
    boundsEast: be,
    boundsNorth: bn,
    minZoom,
    maxZoom,
    tileCount,
    ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
  };
  const [row] = await db
    .insert(offlineRegionsTable)
    .values(values)
    .onConflictDoUpdate({
      target: offlineRegionsTable.id,
      set: {
        name,
        boundsWest: bw,
        boundsSouth: bs,
        boundsEast: be,
        boundsNorth: bn,
        minZoom,
        maxZoom,
        tileCount,
      },
      where: eq(offlineRegionsTable.userId, uid),
    })
    .returning();
  res.json(
    UpsertMyRegionResponse.parse({
      id: row.id,
      name: row.name,
      bounds: [row.boundsWest, row.boundsSouth, row.boundsEast, row.boundsNorth],
      minZoom: row.minZoom,
      maxZoom: row.maxZoom,
      tileCount: row.tileCount,
      createdAt: row.createdAt,
    }),
  );
});

router.delete("/me/regions/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(offlineRegionsTable)
    .where(
      and(
        eq(offlineRegionsTable.userId, uid),
        eq(offlineRegionsTable.id, id),
      ),
    );
  res.sendStatus(204);
});

// ---------- Tracks ----------

const TRACK_SUMMARY_COLUMNS = {
  id: tracksTable.id,
  name: tracksTable.name,
  description: tracksTable.description,
  color: tracksTable.color,
  kind: tracksTable.kind,
  distanceMeters: tracksTable.distanceMeters,
  durationMs: tracksTable.durationMs,
  pointCount: tracksTable.pointCount,
  startedAt: tracksTable.startedAt,
  endedAt: tracksTable.endedAt,
  createdAt: tracksTable.createdAt,
  shareToken: tracksTable.shareToken,
  shareVisibility: tracksTable.shareVisibility,
};

router.get("/me/tracks", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const rows = await db
    .select(TRACK_SUMMARY_COLUMNS)
    .from(tracksTable)
    .where(eq(tracksTable.userId, uid))
    .orderBy(desc(tracksTable.startedAt));
  res.json(rows.map((r) => ListMyTracksResponseItem.parse(r)));
});

router.get("/me/tracks/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(tracksTable)
    .where(and(eq(tracksTable.userId, uid), eq(tracksTable.id, id)));
  if (!row) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  res.json(
    GetMyTrackResponse.parse({
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      kind: row.kind,
      distanceMeters: row.distanceMeters,
      durationMs: row.durationMs,
      pointCount: row.pointCount,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      createdAt: row.createdAt,
      shareToken: row.shareToken,
      shareVisibility: row.shareVisibility,
      points: row.points,
    }),
  );
});

router.put("/me/tracks/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = TrackInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, color, kind, points, startedAt, endedAt } =
    parsed.data;

  // Compute stats server-side from points (defense in depth).
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    dist += haversineMeters(a.lat, a.lng, b.lat, b.lng);
  }
  const startMs = startedAt
    ? new Date(startedAt).getTime()
    : (points[0]?.t ?? Date.now());
  const endMs = endedAt
    ? new Date(endedAt).getTime()
    : (points[points.length - 1]?.t ?? startMs);
  const durationMs = Math.max(0, endMs - startMs);

  const trackKind = kind ?? "recorded";
  const values = {
    id,
    userId: uid,
    name,
    description: description ?? null,
    color: color ?? "#c8633a",
    kind: trackKind,
    distanceMeters: dist,
    durationMs,
    pointCount: points.length,
    points,
    startedAt: new Date(startMs),
    endedAt: new Date(endMs),
  };
  const [row] = await db
    .insert(tracksTable)
    .values(values)
    .onConflictDoUpdate({
      target: tracksTable.id,
      set: {
        name,
        description: description ?? null,
        color: values.color,
        kind: trackKind,
        distanceMeters: dist,
        durationMs,
        pointCount: points.length,
        points,
        startedAt: new Date(startMs),
        endedAt: new Date(endMs),
      },
      where: eq(tracksTable.userId, uid),
    })
    .returning(TRACK_SUMMARY_COLUMNS);
  res.json(UpsertMyTrackResponse.parse(row));
});

router.delete("/me/tracks/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(tracksTable)
    .where(and(eq(tracksTable.userId, uid), eq(tracksTable.id, id)));
  res.sendStatus(204);
});

// ---------- Track link sharing ----------

router.post("/me/tracks/:id/share", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = ShareTrackInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { visibility } = parsed.data;

  const [existing] = await db
    .select({ shareToken: tracksTable.shareToken })
    .from(tracksTable)
    .where(and(eq(tracksTable.userId, uid), eq(tracksTable.id, id)));
  if (!existing) {
    res.status(404).json({ error: "Track not found" });
    return;
  }

  // Reuse the existing token when re-sharing (e.g. flipping visibility) so a
  // link already handed out keeps working; only mint one the first time.
  const token = existing.shareToken ?? randomBytes(9).toString("base64url");

  await db
    .update(tracksTable)
    .set({ shareToken: token, shareVisibility: visibility, sharedAt: new Date() })
    .where(and(eq(tracksTable.userId, uid), eq(tracksTable.id, id)));

  req.log.info({ id, visibility }, "Track shared");
  res.json(
    ShareMyTrackResponse.parse({
      token,
      visibility,
      url: `${shareOrigin()}/r/${token}`,
    }),
  );
});

router.delete("/me/tracks/:id/share", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .update(tracksTable)
    .set({ shareToken: null, shareVisibility: null, sharedAt: null })
    .where(and(eq(tracksTable.userId, uid), eq(tracksTable.id, id)));
  req.log.info({ id }, "Track sharing revoked");
  res.sendStatus(204);
});

// ---------- Paid private project sharing ----------

router.get(
  "/me/tracks/:id/private-projects",
  async (req, res): Promise<void> => {
    const uid = req.user!.id;
    const id = paramId(req);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const rows = await db
      .select()
      .from(privateProjectsTable)
      .where(
        and(
          eq(privateProjectsTable.userId, uid),
          eq(privateProjectsTable.trackId, id),
        ),
      )
      .orderBy(desc(privateProjectsTable.createdAt));

    res.json(
      ListMyTrackPrivateProjectsResponse.parse(rows.map(toPrivateProjectView)),
    );
  },
);

router.post(
  "/me/tracks/:id/private-projects/test",
  async (req, res): Promise<void> => {
    const uid = req.user!.id;
    if (!(await betaPrivateSharingEnabledForUser(uid))) {
      res.status(403).json({ error: "Beta private sharing is not enabled for this account." });
      return;
    }
    const id = paramId(req);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [track] = await db
      .select({ id: tracksTable.id, pointCount: tracksTable.pointCount })
      .from(tracksTable)
      .where(and(eq(tracksTable.id, id), eq(tracksTable.userId, uid)));
    if (!track) {
      res.status(404).json({ error: "Track not found" });
      return;
    }
    if (track.pointCount < 2) {
      res.status(400).json({ error: "A route needs at least two points to share." });
      return;
    }

    try {
      const project = await createBetaPrivateProject({ userId: uid, trackId: track.id });
      req.log.info({ trackId: track.id, projectId: project.id }, "Beta private project activated");
      res.json(CreateBetaPrivateProjectResponse.parse(toPrivateProjectView(project)));
    } catch (err) {
      req.log.error({ err, trackId: track.id }, "Failed to activate beta private project");
      res.status(500).json({ error: "Couldn't create beta private project. Please try again later." });
    }
  },
);

router.post(
  "/me/tracks/:id/private-projects",
  async (req, res): Promise<void> => {
    const uid = req.user!.id;
    const id = paramId(req);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = CreatePrivateProjectCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [track] = await db
      .select({ id: tracksTable.id, pointCount: tracksTable.pointCount })
      .from(tracksTable)
      .where(and(eq(tracksTable.id, id), eq(tracksTable.userId, uid)));
    if (!track) {
      res.status(404).json({ error: "Track not found" });
      return;
    }
    if (track.pointCount < 2) {
      res.status(400).json({ error: "A route needs at least two points to share." });
      return;
    }

    try {
      const checkout = await createPrivateProjectCheckout({
        userId: uid,
        trackId: track.id,
      });
      req.log.info({ trackId: track.id, projectId: checkout.projectId }, "Private project checkout created");
      res.json(CreatePrivateProjectCheckoutResponse.parse(checkout));
    } catch (err) {
      req.log.error({ err, trackId: track.id }, "Failed to create private project checkout");
      res.status(503).json({
        error: checkoutUnavailableMessage(
          err,
          "Couldn't start private project checkout. Please try again later.",
        ),
      });
    }
  },
);

router.get("/me/private-projects/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [project] = await db
    .select()
    .from(privateProjectsTable)
    .where(and(eq(privateProjectsTable.id, id), eq(privateProjectsTable.userId, uid)));
  if (!project) {
    res.status(404).json({ error: "Private project not found" });
    return;
  }
  res.json(GetMyPrivateProjectResponse.parse(toPrivateProjectView(project)));
});

router.post("/me/private-projects/:id/confirm", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = ConfirmMyPrivateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(privateProjectsTable)
    .where(and(eq(privateProjectsTable.id, id), eq(privateProjectsTable.userId, uid)));
  if (!project || project.stripeCheckoutSessionId !== parsed.data.sessionId) {
    res.status(404).json({ error: "Private project not found" });
    return;
  }

  try {
    const current = await activatePrivateProjectFromCheckoutSession(
      parsed.data.sessionId,
    );
    if (!current || current.id !== id) {
      res.status(404).json({ error: "Private project not found" });
      return;
    }
    res.json(ConfirmMyPrivateProjectResponse.parse(toPrivateProjectView(current)));
  } catch (err) {
    req.log.error({ err, projectId: id }, "Failed to confirm private project payment");
    res.status(503).json({
      error: "We couldn't confirm payment yet. Please try again in a moment.",
    });
  }
});

router.delete("/me/private-projects/:id", async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const id = paramId(req);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [project] = await db
    .update(privateProjectsTable)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(privateProjectsTable.id, id), eq(privateProjectsTable.userId, uid)))
    .returning({ id: privateProjectsTable.id });
  if (!project) {
    res.status(404).json({ error: "Private project not found" });
    return;
  }
  req.log.info({ projectId: id }, "Private project revoked");
  res.sendStatus(204);
});

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export default router;
