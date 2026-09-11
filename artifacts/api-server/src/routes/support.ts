import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, ilike, lte, ne } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateSupportRequestBody,
  ListSupportRequestsQueryParams,
  ListSupportRequestsResponse,
  UpdateSupportRequestBody,
  UpdateSupportRequestParams,
  UpdateSupportRequestResponse,
} from "@workspace/api-zod";
import { db, supportRequestsTable } from "@workspace/db";
import { escapeHtml } from "../seo/ssrShared";
import { rateLimit } from "../middlewares/rateLimit";

const router: IRouter = Router();
const staffPageRouter: IRouter = Router();
// Support is a human-support path, not a bulk intake endpoint. Five/hour lets a
// real person correct a mistake without allowing a form to be used for abuse.
const supportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
const staffLoginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5 });
const STAFF_COOKIE = "mapper_support_review";
const STAFF_COOKIE_PATH = "/_admin/support";
const STAFF_LOGIN_PATH = `${STAFF_COOKIE_PATH}/login`;
const STAFF_DASHBOARD_PATH = STAFF_COOKIE_PATH;
const CATEGORY_OPTIONS = ["bug", "question", "sharing_offline", "partnership"] as const;
const SEVERITY_OPTIONS = ["low", "medium", "high", "critical"] as const;
const STATUS_OPTIONS = ["new", "reviewed", "resolved"] as const;
type SupportRequestFilters = {
  category?: (typeof CATEGORY_OPTIONS)[number];
  severity?: (typeof SEVERITY_OPTIONS)[number];
  status?: (typeof STATUS_OPTIONS)[number];
  from?: Date;
  to?: Date;
  reference?: string;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function nextReference(): string {
  return `AC-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function supportRequestResponse(row: typeof supportRequestsTable.$inferSelect) {
  return {
    reference: row.reference,
    category: row.category as (typeof CATEGORY_OPTIONS)[number],
    severity: row.severity as (typeof SEVERITY_OPTIONS)[number],
    summary: row.summary,
    description: row.description,
    reproductionSteps: row.reproductionSteps,
    expectedBehavior: row.expectedBehavior,
    actualBehavior: row.actualBehavior,
    context: row.context,
    environment: row.environment,
    contactEmail: row.contactEmail,
    mediaUrl: row.mediaUrl,
    status: row.status as (typeof STATUS_OPTIONS)[number],
    createdAt: row.createdAt,
  };
}

function staffCookieSignature(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for the support review area");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function newStaffCookie(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + 8 * 60 * 60_000 }),
  ).toString("base64url");
  return `${payload}.${staffCookieSignature(payload)}`;
}

function isStaff(req: Request): boolean {
  const raw = req.cookies?.[STAFF_COOKIE];
  if (typeof raw !== "string") return false;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return false;
  const expected = staffCookieSignature(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return false;
  }
  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof value.exp === "number" && value.exp > Date.now();
  } catch {
    return false;
  }
}

function secretMatches(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return (
    inputBuffer.length === expectedBuffer.length &&
    timingSafeEqual(inputBuffer, expectedBuffer)
  );
}

function requireStaffPage(req: Request, res: Response): boolean {
  if (isStaff(req)) return true;
  res.redirect(STAFF_LOGIN_PATH);
  return false;
}

function dateFilter(value: unknown): Date | string | undefined {
  if (typeof value !== "string") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
    ? value
    : parsed;
}

function filterInput(query: Request["query"]) {
  return {
    category: typeof query.category === "string" ? query.category : undefined,
    severity: typeof query.severity === "string" ? query.severity : undefined,
    status: typeof query.status === "string" ? query.status : undefined,
    from: dateFilter(query.from),
    to: dateFilter(query.to),
    reference: typeof query.reference === "string" ? query.reference : undefined,
  };
}

function parseDashboardFilters(query: Request["query"]) {
  const raw = filterInput(query);
  const parsed = ListSupportRequestsQueryParams.safeParse(raw);
  if (!parsed.success) return { error: "Use valid filters to review requests." } as const;
  return { filters: parsed.data as SupportRequestFilters } as const;
}

function queryBounds(filters: SupportRequestFilters) {
  const conditions = [];
  if (filters.category) conditions.push(eq(supportRequestsTable.category, filters.category));
  if (filters.severity) conditions.push(eq(supportRequestsTable.severity, filters.severity));
  if (filters.status) conditions.push(eq(supportRequestsTable.status, filters.status));
  if (filters.reference?.trim()) {
    conditions.push(ilike(supportRequestsTable.reference, `%${filters.reference.trim()}%`));
  }
  if (filters.from) {
    conditions.push(gte(supportRequestsTable.createdAt, filters.from));
  }
  if (filters.to) {
    const endOfDay = new Date(filters.to);
    endOfDay.setUTCHours(23, 59, 59, 999);
    conditions.push(lte(supportRequestsTable.createdAt, endOfDay));
  }
  return conditions;
}

async function listPrivateRequests(filters: SupportRequestFilters) {
  return db
    .select()
    .from(supportRequestsTable)
    .where(and(...queryBounds(filters)))
    .orderBy(desc(supportRequestsTable.createdAt))
    .limit(200);
}

async function updatePrivateRequestStatus(
  reference: string,
  status: "reviewed" | "resolved",
) {
  const [row] = await db
    .update(supportRequestsTable)
    .set({ status })
    .where(
      status === "reviewed"
        ? and(
          eq(supportRequestsTable.reference, reference),
          ne(supportRequestsTable.status, "resolved"),
        )
        : eq(supportRequestsTable.reference, reference),
    )
    .returning();
  if (row) return { row } as const;

  const [existing] = await db
    .select({ status: supportRequestsTable.status })
    .from(supportRequestsTable)
    .where(eq(supportRequestsTable.reference, reference))
    .limit(1);
  if (!existing) return { missing: true } as const;
  return { terminal: true } as const;
}

function staffShell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · mapper.one</title><style>
  :root{--bg:#f6f4ee;--ink:#282622;--muted:#6b6961;--line:#dedbd1;--card:#fffdf8;--green:#426c4e;--red:#9b4534;--blue:#385c74}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px Inter,system-ui,sans-serif;line-height:1.5}.wrap{max-width:1140px;margin:auto;padding:28px 20px}header{border-bottom:1px solid var(--line);background:var(--card)}header .wrap{display:flex;justify-content:space-between;gap:12px;align-items:center;padding-top:14px;padding-bottom:14px}.brand{font:600 20px Georgia,serif;color:var(--ink);text-decoration:none}.muted{color:var(--muted)}h1,h2,h3{font-family:Georgia,serif;line-height:1.15}h1{font-size:clamp(28px,5vw,44px);margin:0 0 10px}h2{font-size:22px;margin:0}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:18px 0}.btn{appearance:none;border:0;border-radius:999px;background:var(--green);color:#fff;padding:9px 14px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block;font:inherit}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.btn.resolve{background:var(--blue)}input,select{font:inherit;padding:9px;border:1px solid var(--line);border-radius:8px;background:#fff;min-width:0}.filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:end}.filters label{font-size:12px;font-weight:700;display:grid;gap:5px}.filters .actions{display:flex;gap:8px;align-items:center;grid-column:span 3}.request{padding:0;overflow:hidden}.request summary{cursor:pointer;list-style:none;padding:17px 20px;display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center}.request summary::-webkit-details-marker{display:none}.request summary:hover{background:#faf8f2}.request-main{min-width:0}.request-title{font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.request-meta{font-size:12px;color:var(--muted);margin-top:3px}.badge{display:inline-block;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700;background:#e9e6dd;text-transform:capitalize}.badge.reviewed{background:#e6ead4;color:#586018}.badge.resolved{background:#dcebdd;color:#285436}.severity-critical,.severity-high{color:var(--red);font-weight:700}.detail{border-top:1px solid var(--line);padding:20px}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.field{min-width:0}.field.full{grid-column:1/-1}.label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}.value{margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere}.request-actions{margin-top:20px;padding-top:16px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap}.login{max-width:420px;margin:10vh auto}.notice{padding:10px 12px;border-radius:8px;background:#f5e6df;color:#763d2d}.empty{text-align:center;padding:32px;color:var(--muted)}@media(max-width:700px){.wrap{padding:20px 14px}.filters{grid-template-columns:repeat(2,minmax(0,1fr))}.filters .actions{grid-column:span 2}.request summary{grid-template-columns:1fr;gap:6px}.detail-grid{grid-template-columns:1fr}}</style></head><body>${body}</body></html>`;
}

function optionTags(
  options: readonly string[],
  current: string | undefined,
  label: string,
): string {
  return `<option value="">${escapeHtml(label)}</option>${options
    .map((option) => `<option value="${option}"${option === current ? " selected" : ""}>${escapeHtml(option.replace("_", " "))}</option>`)
    .join("")}`;
}

function httpLink(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? `<a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`
      : escapeHtml(url);
  } catch {
    return escapeHtml(url);
  }
}

function submittedField(label: string, value: string | null, full = false): string {
  if (!value) return "";
  const content = label === "Screenshot or recording link" ? httpLink(value) : escapeHtml(value);
  return `<div class="field${full ? " full" : ""}"><div class="label">${escapeHtml(label)}</div><div class="value">${content}</div></div>`;
}

function requestCard(row: typeof supportRequestsTable.$inferSelect): string {
  const request = supportRequestResponse(row);
  const statusActions = request.status === "resolved"
    ? ""
    : `<form method="post" action="${STAFF_DASHBOARD_PATH}/requests/${encodeURIComponent(request.reference)}" class="request-actions"><button class="btn ghost" type="submit" name="status" value="reviewed">Mark reviewed</button><button class="btn resolve" type="submit" name="status" value="resolved">Mark resolved</button></form>`;
  return `<details class="card request"><summary><span class="badge ${escapeHtml(request.status)}">${escapeHtml(request.status)}</span><span class="request-main"><span class="request-title">${escapeHtml(request.summary)}</span><span class="request-meta">${escapeHtml(request.reference)} · ${escapeHtml(request.category.replace("_", " "))} · <span class="severity-${escapeHtml(request.severity)}">${escapeHtml(request.severity)}</span></span></span><time class="request-meta" datetime="${request.createdAt.toISOString()}">${escapeHtml(request.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }))}</time></summary><div class="detail"><div class="detail-grid">${submittedField("What happened?", request.description, true)}${submittedField("Steps to reproduce", request.reproductionSteps, true)}${submittedField("Expected behavior", request.expectedBehavior)}${submittedField("Actual behavior", request.actualBehavior)}${submittedField("Route or project context", request.context)}${submittedField("Device, browser, or app version", request.environment)}${submittedField("Email for a reply", request.contactEmail)}${submittedField("Screenshot or recording link", request.mediaUrl)}</div>${statusActions}</div></details>`;
}

function dashboardHtml(
  rows: Array<typeof supportRequestsTable.$inferSelect>,
  filters: {
    category?: string;
    severity?: string;
    status?: string;
    from?: Date;
    to?: Date;
    reference?: string;
  },
  notice?: string,
): string {
  const dateInput = (value: Date | undefined) => value ? value.toISOString().slice(0, 10) : "";
  return staffShell("Support review", `<header><div class="wrap"><a class="brand" href="${STAFF_DASHBOARD_PATH}">mapper.one · Support review</a><form method="post" action="${STAFF_DASHBOARD_PATH}/logout"><button class="btn ghost">Sign out</button></form></div></header><main class="wrap"><p class="muted">The Adventure Collective · private staff workspace</p><h1>Support requests</h1><p class="muted">Requests stay private here and never appear on the community feedback board.</p>${notice ? `<p class="notice">${escapeHtml(notice)}</p>` : ""}<section class="card"><form method="get" action="${STAFF_DASHBOARD_PATH}" class="filters"><label>Category<select name="category">${optionTags(CATEGORY_OPTIONS, filters.category, "All categories")}</select></label><label>Severity<select name="severity">${optionTags(SEVERITY_OPTIONS, filters.severity, "All severities")}</select></label><label>Status<select name="status">${optionTags(STATUS_OPTIONS, filters.status, "All statuses")}</select></label><label>From<input type="date" name="from" value="${dateInput(filters.from)}"></label><label>To<input type="date" name="to" value="${dateInput(filters.to)}"></label><label>Reference<input name="reference" maxlength="32" value="${escapeHtml(filters.reference ?? "")}" placeholder="AC-…"></label><div class="actions"><button class="btn" type="submit">Apply filters</button><a class="btn ghost" href="${STAFF_DASHBOARD_PATH}">Clear</a><span class="muted">${rows.length === 200 ? "Showing the newest 200 matching requests." : `${rows.length} request${rows.length === 1 ? "" : "s"} found.`}</span></div></form></section>${rows.length ? rows.map(requestCard).join("") : '<section class="card empty">No private support requests match these filters.</section>'}</main></body></html>`);
}

router.post(
  "/support/requests",
  supportLimiter,
  async (req, res): Promise<void> => {
    const parsed = CreateSupportRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please review the form fields." });
      return;
    }
    if (parsed.data.website) {
      // Honeypot submissions receive a deliberately generic success response;
      // this neither reveals the defense nor creates a stored private record.
      res.status(201).json({
        reference: "AC-RECEIVED",
        message: "Thanks — your request has been received.",
      });
      return;
    }

    const values = parsed.data;
    let reference = nextReference();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await db.insert(supportRequestsTable).values({
          reference,
          category: values.category,
          severity: values.severity,
          summary: values.summary.trim(),
          description: values.description.trim(),
          reproductionSteps: clean(values.reproductionSteps),
          expectedBehavior: clean(values.expectedBehavior),
          actualBehavior: clean(values.actualBehavior),
          context: clean(values.context),
          environment: clean(values.environment),
          contactEmail: clean(values.contactEmail),
          mediaUrl: clean(values.mediaUrl),
        });
        res.status(201).json({
          reference,
          message: "Thanks — your private support request has been received. Keep this reference for your records.",
        });
        return;
      } catch (error) {
        if (attempt === 2) {
          req.log.error({ error }, "Failed to save private support request");
          res.status(503).json({ error: "Support requests are temporarily unavailable. Please email info@advguides.com." });
          return;
        }
        reference = nextReference();
      }
    }
  },
);

router.get("/support/requests", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!isStaff(req)) {
    res.status(401).json({ error: "Staff authorization is required." });
    return;
  }
  const parsed = ListSupportRequestsQueryParams.safeParse(filterInput(req.query));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid support request filters." });
    return;
  }
  const rows = await listPrivateRequests(parsed.data as SupportRequestFilters);
  res.json(ListSupportRequestsResponse.parse(rows.map(supportRequestResponse)));
});

router.patch(
  "/support/requests/:reference",
  async (req, res): Promise<void> => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!isStaff(req)) {
      res.status(401).json({ error: "Staff authorization is required." });
      return;
    }
    const params = UpdateSupportRequestParams.safeParse(req.params);
    const parsed = UpdateSupportRequestBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid support request update." });
      return;
    }
    const result = await updatePrivateRequestStatus(
      params.data.reference,
      parsed.data.status,
    );
    if ("missing" in result) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    if ("terminal" in result) {
      res.status(409).json({ error: "Resolved support requests cannot be marked reviewed." });
      return;
    }
    req.log.info({ reference: result.row.reference, status: result.row.status }, "Support request status updated");
    res.json(UpdateSupportRequestResponse.parse(supportRequestResponse(result.row)));
  },
);

staffPageRouter.get(STAFF_LOGIN_PATH, (req, res): void => {
  if (isStaff(req)) {
    res.redirect(STAFF_DASHBOARD_PATH);
    return;
  }
  const failed = req.query.error === "1";
  res.setHeader("Cache-Control", "private, no-store");
  res.type("html").send(staffShell("Support review sign in", `<main class="wrap"><section class="card login"><p class="muted">The Adventure Collective staff workspace</p><h1>Support review</h1>${failed ? '<p class="notice">Sign-in failed. Check the username and password, then try again.</p>' : ""}<form method="post" action="${STAFF_LOGIN_PATH}" style="margin-top:18px"><p><label for="username">Username</label><input id="username" name="username" autocomplete="username" required></p><p><label for="password">Password</label><input id="password" type="password" name="password" autocomplete="current-password" required></p><button class="btn">Sign in</button></form></section></main>`));
});

staffPageRouter.post(STAFF_LOGIN_PATH, staffLoginLimiter, (req, res): void => {
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const configuredUsername = process.env.TRAIL_GUIDE_ADMIN_USERNAME;
  const configuredPassword = process.env.TRAIL_GUIDE_ADMIN_PASSWORD;
  if (
    !configuredUsername ||
    !configuredPassword ||
    !secretMatches(username, configuredUsername) ||
    !secretMatches(password, configuredPassword)
  ) {
    res.redirect(`${STAFF_LOGIN_PATH}?error=1`);
    return;
  }
  res.cookie(STAFF_COOKIE, newStaffCookie(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60_000,
    path: "/",
  });
  res.redirect(STAFF_DASHBOARD_PATH);
});

staffPageRouter.post(`${STAFF_DASHBOARD_PATH}/logout`, (req, res): void => {
  res.clearCookie(STAFF_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  res.redirect(STAFF_LOGIN_PATH);
});

staffPageRouter.get(STAFF_DASHBOARD_PATH, async (req, res): Promise<void> => {
  if (!requireStaffPage(req, res)) return;
  const parsed = parseDashboardFilters(req.query);
  res.setHeader("Cache-Control", "private, no-store");
  if ("error" in parsed) {
    res.status(400).type("html").send(dashboardHtml([], {}, parsed.error));
    return;
  }
  const rows = await listPrivateRequests(parsed.filters);
  res.type("html").send(dashboardHtml(rows, parsed.filters));
});

staffPageRouter.post(
  `${STAFF_DASHBOARD_PATH}/requests/:reference`,
  async (req, res): Promise<void> => {
    if (!requireStaffPage(req, res)) return;
    const params = UpdateSupportRequestParams.safeParse(req.params);
    const parsed = UpdateSupportRequestBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).type("html").send(staffShell("Invalid support update", `<main class="wrap"><section class="card"><h1>Unable to update request</h1><p>Choose either reviewed or resolved, then try again.</p><a class="btn" href="${STAFF_DASHBOARD_PATH}">Return to support review</a></section></main>`));
      return;
    }
    const result = await updatePrivateRequestStatus(
      params.data.reference,
      parsed.data.status,
    );
    if ("missing" in result) {
      res.status(404).type("html").send(staffShell("Support request not found", `<main class="wrap"><section class="card"><h1>Request not found</h1><a class="btn" href="${STAFF_DASHBOARD_PATH}">Return to support review</a></section></main>`));
      return;
    }
    if ("terminal" in result) {
      res.status(409).type("html").send(staffShell("Support request resolved", `<main class="wrap"><section class="card"><h1>Request is already resolved</h1><p>Resolved support requests cannot be marked reviewed.</p><a class="btn" href="${STAFF_DASHBOARD_PATH}">Return to support review</a></section></main>`));
      return;
    }
    req.log.info({ reference: result.row.reference, status: result.row.status }, "Support request status updated");
    res.redirect(STAFF_DASHBOARD_PATH);
  },
);

export { staffPageRouter as supportStaffPageRouter };
export default router;