import { randomBytes, randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  fieldProjectMembersTable,
  fieldProjectReportLinksTable,
  fieldProjectRoutesTable,
  fieldProjectsTable,
  fieldReportHistoryTable,
  fieldReportsTable,
  tracksTable,
} from "@workspace/db";
import {
  CreateProjectBody,
  CreateProjectReportBody,
  CreatePublicProjectReportBody,
  RequestProjectReportPhotoUploadBody,
  RequestPublicProjectReportPhotoUploadBody,
  UpdateProjectBody,
  UpdateProjectReportBody,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const PUBLIC_ORIGIN = (process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://mapper.one");
const publicRateLimits = new Map<string, number[]>();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function idParam(req: Request, name: string): string | null {
  const value = req.params[name];
  return typeof value === "string" && value.length ? value : null;
}

function reportUrl(projectId: string, reportId: string, kind: "evidence" | "resolution", index: number) {
  return `/api/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(reportId)}/photos/${kind}/${index}`;
}

function asReport(row: typeof fieldReportsTable.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    photoCount: row.photoPaths.length,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function memberRole(projectId: string, userId: string): Promise<"owner" | "member" | null> {
  const [project] = await db
    .select({ ownerId: fieldProjectsTable.ownerId })
    .from(fieldProjectsTable)
    .where(eq(fieldProjectsTable.id, projectId))
    .limit(1);
  if (!project) return null;
  if (project.ownerId === userId) return "owner";
  const [membership] = await db
    .select({ id: fieldProjectMembersTable.id })
    .from(fieldProjectMembersTable)
    .where(and(eq(fieldProjectMembersTable.projectId, projectId), eq(fieldProjectMembersTable.userId, userId)))
    .limit(1);
  return membership ? "member" : null;
}

async function requireMember(req: Request, res: Response, projectId: string): Promise<"owner" | "member" | null> {
  const role = await memberRole(projectId, req.user!.id);
  if (!role) res.status(404).json({ error: "Project not found" });
  return role;
}

function validPhotoPaths(paths: unknown, projectId: string): paths is string[] {
  return Array.isArray(paths) && paths.length <= 8 && paths.every(
    (path) => typeof path === "string" && path.startsWith(`/objects/project-report-photos/${projectId}/`),
  );
}

function rateLimit(req: Request, token: string): boolean {
  const key = `${token}:${req.ip}`;
  const now = Date.now();
  const requests = (publicRateLimits.get(key) ?? []).filter((time) => now - time < 60_000);
  if (requests.length >= 10) return false;
  requests.push(now);
  publicRateLimits.set(key, requests);
  return true;
}

async function publicLink(token: string) {
  const [link] = await db
    .select()
    .from(fieldProjectReportLinksTable)
    .where(and(eq(fieldProjectReportLinksTable.token, token), eq(fieldProjectReportLinksTable.active, true)))
    .limit(1);
  return link ?? null;
}

router.get("/projects", requireAuth, async (req, res): Promise<void> => {
  const uid = req.user!.id;
  const owned = await db.select().from(fieldProjectsTable).where(eq(fieldProjectsTable.ownerId, uid));
  const memberships = await db
    .select({ project: fieldProjectsTable })
    .from(fieldProjectMembersTable)
    .innerJoin(fieldProjectsTable, eq(fieldProjectMembersTable.projectId, fieldProjectsTable.id))
    .where(eq(fieldProjectMembersTable.userId, uid));
  const byId = new Map([...owned, ...memberships.map((row) => row.project)].map((project) => [project.id, project]));
  const projects = await Promise.all([...byId.values()].map(async (project) => {
    const reports = await db.select({ id: fieldReportsTable.id }).from(fieldReportsTable)
      .where(eq(fieldReportsTable.projectId, project.id));
    return { ...project, reportCount: reports.length };
  }));
  res.json(projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
});

router.post("/projects", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, trackIds = [] } = parsed.data;
  const uid = req.user!.id;
  const uniqueTrackIds = [...new Set(trackIds)];
  if (uniqueTrackIds.length) {
    const tracks = await db.select({ id: tracksTable.id }).from(tracksTable)
      .where(and(eq(tracksTable.userId, uid), inArray(tracksTable.id, uniqueTrackIds)));
    if (tracks.length !== uniqueTrackIds.length) {
      res.status(400).json({ error: "Every linked route must belong to you" });
      return;
    }
  }
  const projectId = randomUUID();
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(fieldProjectsTable).values({ id: projectId, ownerId: uid, name, description: description ?? null, createdAt: now, updatedAt: now });
    await tx.insert(fieldProjectReportLinksTable).values({ id: randomUUID(), projectId, token, active: true });
    if (uniqueTrackIds.length) await tx.insert(fieldProjectRoutesTable).values(uniqueTrackIds.map((trackId) => ({ id: randomUUID(), projectId, trackId })));
  });
  res.status(201).json({ id: projectId, ownerId: uid, name, description: description ?? null, status: "active", reportCount: 0, createdAt: now, updatedAt: now, publicReportUrl: `${PUBLIC_ORIGIN}/report/${token}` });
});

router.get("/projects/:projectId", requireAuth, async (req, res): Promise<void> => {
  const projectId = idParam(req, "projectId");
  if (!projectId) { res.status(400).json({ error: "Invalid project id" }); return; }
  const role = await requireMember(req, res, projectId);
  if (!role) return;
  const [project] = await db.select().from(fieldProjectsTable).where(eq(fieldProjectsTable.id, projectId)).limit(1);
  const [link] = await db.select().from(fieldProjectReportLinksTable).where(and(eq(fieldProjectReportLinksTable.projectId, projectId), eq(fieldProjectReportLinksTable.active, true))).limit(1);
  const routes = await db.select({ id: fieldProjectRoutesTable.id, trackId: tracksTable.id, name: tracksTable.name })
    .from(fieldProjectRoutesTable).innerJoin(tracksTable, eq(fieldProjectRoutesTable.trackId, tracksTable.id))
    .where(eq(fieldProjectRoutesTable.projectId, projectId));
  const reports = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.projectId, projectId)).orderBy(desc(fieldReportsTable.updatedAt));
  res.json({ ...project!, reportCount: reports.length, publicReportUrl: `${PUBLIC_ORIGIN}/report/${link?.token ?? ""}`, role, routes, reports: reports.map(asReport) });
});

router.patch("/projects/:projectId", requireAuth, async (req, res): Promise<void> => {
  const projectId = idParam(req, "projectId");
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!projectId || !parsed.success) { res.status(400).json({ error: "Invalid project update" }); return; }
  const role = await requireMember(req, res, projectId);
  if (!role) return;
  if (role !== "owner") { res.status(403).json({ error: "Only the project owner can edit project settings" }); return; }
  const [updated] = await db.update(fieldProjectsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(fieldProjectsTable.id, projectId)).returning();
  res.json({ ...updated, reportCount: 0, publicReportUrl: "" });
});

router.get("/projects/:projectId/reports", requireAuth, async (req, res): Promise<void> => {
  const projectId = idParam(req, "projectId");
  if (!projectId || !(await requireMember(req, res, projectId))) return;
  const rows = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.projectId, projectId)).orderBy(desc(fieldReportsTable.updatedAt));
  res.json(rows.map(asReport));
});

async function insertReport(projectId: string, input: { title?: string | null; description: string; category?: string | null; priority?: string; latitude: number; longitude: number; photoPaths?: string[] }, actorUserId: string | null, reporterLabel: string) {
  const reportId = randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(fieldReportsTable).values({
      id: reportId, projectId, title: input.title ?? null, description: input.description,
      category: input.category ?? null, priority: input.priority ?? "medium", latitude: String(input.latitude),
      longitude: String(input.longitude), photoPaths: input.photoPaths ?? [], createdByUserId: actorUserId, reporterLabel, createdAt: now, updatedAt: now,
    });
    await tx.insert(fieldReportHistoryTable).values({ id: randomUUID(), reportId, actorUserId, action: "created", note: reporterLabel === "public" ? "Submitted from the public reporting link." : null });
  });
  const [row] = await db.select().from(fieldReportsTable).where(eq(fieldReportsTable.id, reportId)).limit(1);
  return row!;
}

router.post("/projects/:projectId/reports", requireAuth, async (req, res): Promise<void> => {
  const projectId = idParam(req, "projectId");
  const parsed = CreateProjectReportBody.safeParse(req.body);
  if (!projectId || !parsed.success) { res.status(400).json({ error: parsed.success ? "Invalid project id" : parsed.error.message }); return; }
  if (!(await requireMember(req, res, projectId))) return;
  if (!validPhotoPaths(parsed.data.photoPaths ?? [], projectId)) { res.status(400).json({ error: "Invalid evidence photo path" }); return; }
  res.status(201).json(asReport(await insertReport(projectId, parsed.data, req.user!.id, "team")));
});

router.get("/projects/:projectId/reports/:reportId", requireAuth, async (req, res): Promise<void> => {
  const projectId = idParam(req, "projectId"); const reportId = idParam(req, "reportId");
  if (!projectId || !reportId || !(await requireMember(req, res, projectId))) return;
  const [report] = await db.select().from(fieldReportsTable).where(and(eq(fieldReportsTable.id, reportId), eq(fieldReportsTable.projectId, projectId))).limit(1);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  const history = await db.select().from(fieldReportHistoryTable).where(eq(fieldReportHistoryTable.reportId, reportId)).orderBy(desc(fieldReportHistoryTable.createdAt));
  res.json({ ...asReport(report), photoUrls: report.photoPaths.map((_, i) => reportUrl(projectId, reportId, "evidence", i)), resolutionPhotoUrls: report.resolutionPhotoPaths.map((_, i) => reportUrl(projectId, reportId, "resolution", i)), history });
});

router.patch("/projects/:projectId/reports/:reportId", requireAuth, async (req, res): Promise<void> => {
  const projectId = idParam(req, "projectId"); const reportId = idParam(req, "reportId");
  const parsed = UpdateProjectReportBody.safeParse(req.body);
  if (!projectId || !reportId || !parsed.success) { res.status(400).json({ error: "Invalid report update" }); return; }
  if (!(await requireMember(req, res, projectId))) return;
  if (!validPhotoPaths(parsed.data.resolutionPhotoPaths ?? [], projectId)) { res.status(400).json({ error: "Invalid resolution photo path" }); return; }
  const [current] = await db.select().from(fieldReportsTable).where(and(eq(fieldReportsTable.id, reportId), eq(fieldReportsTable.projectId, projectId))).limit(1);
  if (!current) { res.status(404).json({ error: "Report not found" }); return; }
  const nextStatus = parsed.data.status ?? current.status;
  const [updated] = await db.update(fieldReportsTable).set({ ...parsed.data, status: nextStatus, resolvedAt: nextStatus === "resolved" ? new Date() : null, updatedAt: new Date() }).where(eq(fieldReportsTable.id, reportId)).returning();
  if (parsed.data.status && parsed.data.status !== current.status) await db.insert(fieldReportHistoryTable).values({ id: randomUUID(), reportId, actorUserId: req.user!.id, action: `status:${nextStatus}`, note: parsed.data.resolutionNote ?? null });
  res.json(asReport(updated));
});

router.post("/projects/:projectId/report-photos/upload", requireAuth, async (req, res): Promise<void> => {
  const projectId = idParam(req, "projectId"); const parsed = RequestProjectReportPhotoUploadBody.safeParse(req.body);
  if (!projectId || !parsed.success) { res.status(400).json({ error: "Invalid upload metadata" }); return; }
  if (!(await requireMember(req, res, projectId))) return;
  if (!parsed.data.contentType.startsWith("image/")) { res.status(400).json({ error: "Evidence must be an image" }); return; }
  const uploadURL = await storage.getObjectEntityUploadURL(`project-report-photos/${projectId}`);
  res.json({ uploadURL, objectPath: storage.normalizeObjectEntityPath(uploadURL), metadata: parsed.data });
});

router.get("/projects/:projectId/reports/:reportId/photos/:kind/:index", requireAuth, async (req, res): Promise<void> => {
  const projectId = idParam(req, "projectId"); const reportId = idParam(req, "reportId");
  if (!projectId || !reportId || !(await requireMember(req, res, projectId))) return;
  const [report] = await db.select().from(fieldReportsTable).where(and(eq(fieldReportsTable.id, reportId), eq(fieldReportsTable.projectId, projectId))).limit(1);
  const index = Number(req.params.index); const paths = req.params.kind === "resolution" ? report?.resolutionPhotoPaths : report?.photoPaths;
  const path = Number.isInteger(index) && index >= 0 ? paths?.[index] : null;
  if (!path) { res.status(404).end(); return; }
  try { const response = await storage.downloadObject(await storage.getObjectEntityFile(path), 0); res.status(response.status); response.headers.forEach((value, key) => res.setHeader(key, value)); res.end(Buffer.from(await response.arrayBuffer())); }
  catch { res.status(404).end(); }
});

router.post("/public-reports/:token", async (req, res): Promise<void> => {
  const token = idParam(req, "token"); const parsed = CreatePublicProjectReportBody.safeParse(req.body);
  if (!token || !parsed.success) { res.status(400).json({ error: "Unable to accept this report" }); return; }
  if (!rateLimit(req, token)) { res.status(429).json({ error: "Too many reports. Please try again in a minute." }); return; }
  const link = await publicLink(token);
  if (!link) { res.status(404).json({ error: "Reporting link not found" }); return; }
  if (parsed.data.antiSpam) { res.status(400).json({ error: "Unable to accept this report" }); return; }
  if (!validPhotoPaths(parsed.data.photoPaths ?? [], link.projectId)) { res.status(400).json({ error: "Invalid evidence photo path" }); return; }
  const report = await insertReport(link.projectId, parsed.data, null, "public");
  res.status(201).json({ reportId: report.id, message: "Thanks — your report was sent to the project team." });
});

router.post("/public-reports/:token/photos/upload", async (req, res): Promise<void> => {
  const token = idParam(req, "token"); const parsed = RequestPublicProjectReportPhotoUploadBody.safeParse(req.body);
  if (!token || !parsed.success || !rateLimit(req, token)) { res.status(429).json({ error: "Too many requests" }); return; }
  const link = await publicLink(token);
  if (!link) { res.status(404).json({ error: "Reporting link not found" }); return; }
  if (!parsed.data.contentType.startsWith("image/")) { res.status(400).json({ error: "Evidence must be an image" }); return; }
  const uploadURL = await storage.getObjectEntityUploadURL(`project-report-photos/${link.projectId}`);
  res.json({ uploadURL, objectPath: storage.normalizeObjectEntityPath(uploadURL), metadata: parsed.data });
});

export default router;