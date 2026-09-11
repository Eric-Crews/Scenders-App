import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import Stripe from "stripe";
import {
  db,
  privateProjectsTable,
  tracksTable,
  waypointsTable,
  type PrivateProjectRow,
} from "@workspace/db";
import { getUncachableStripeClient } from "./stripeClient";

export const PRIVATE_PROJECT_PRICE_CENTS = 1900;
export const PRIVATE_PROJECT_DURATION_DAYS = 180;

const PRIVATE_PROJECT_PRICE_LOOKUP_KEY = "mapper_private_project_180";

export type PrivateProjectStatus = "pending" | "active" | "revoked" | "expired";

export type PrivateProjectView = {
  id: string;
  trackId: string;
  status: PrivateProjectStatus;
  url: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  isBetaTest: boolean;
};

export function privateProjectOrigin(): string {
  return (
    process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "https://mapper.one"
  );
}

function statusFor(row: PrivateProjectRow, now = new Date()): PrivateProjectStatus {
  if (row.status === "revoked") return "revoked";
  if (row.status === "active" && (!row.expiresAt || row.expiresAt <= now)) {
    return "expired";
  }
  return row.status === "active" ? "active" : "pending";
}

export function toPrivateProjectView(row: PrivateProjectRow): PrivateProjectView {
  const status = statusFor(row);
  return {
    id: row.id,
    trackId: row.trackId,
    status,
    url: status === "active" ? `${privateProjectOrigin()}/s/${row.token}` : null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    isBetaTest: row.activationSource === "beta_test",
  };
}

function betaAllowlist(): Set<string> {
  return new Set(
    (process.env.BETA_PRIVATE_SHARING_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isBetaPrivateSharingAllowed(email: string | null): boolean {
  if (!email) return false;
  return betaAllowlist().has(email.trim().toLowerCase());
}

export async function createBetaPrivateProject(input: {
  userId: string;
  trackId: string;
}): Promise<PrivateProjectRow> {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + PRIVATE_PROJECT_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );
  const [project] = await db
    .insert(privateProjectsTable)
    .values({
      id: mintPrivateProjectId(),
      userId: input.userId,
      trackId: input.trackId,
      token: mintPrivateProjectToken(),
      status: "active",
      activationSource: "beta_test",
      expiresAt,
    })
    .returning();
  if (!project) throw new Error("Couldn't create beta private project");
  return project;
}

export function mintPrivateProjectId(): string {
  return `prj_${randomBytes(18).toString("base64url")}`;
}

export function mintPrivateProjectToken(): string {
  // 256 bits of entropy keeps these capability URLs impractical to guess.
  return randomBytes(32).toString("base64url");
}

async function getOrCreatePrivateProjectPrice(stripe: Stripe): Promise<string> {
  const existing = await stripe.prices.list({
    lookup_keys: [PRIVATE_PROJECT_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0].id;

  const product = await stripe.products.create(
    {
      name: "mapper.one Private Project",
      description:
        "One private project link with unlimited view-only recipients for 180 days.",
      metadata: { mapper_product: "private_project_180" },
    },
    { idempotencyKey: "mapper-private-project-product-v1" },
  );
  const price = await stripe.prices.create(
    {
      product: product.id,
      currency: "usd",
      unit_amount: PRIVATE_PROJECT_PRICE_CENTS,
      lookup_key: PRIVATE_PROJECT_PRICE_LOOKUP_KEY,
      metadata: { mapper_product: "private_project_180" },
    },
    { idempotencyKey: "mapper-private-project-price-v1" },
  );
  return price.id;
}

export async function createPrivateProjectCheckout(input: {
  userId: string;
  trackId: string;
}): Promise<{ projectId: string; checkoutUrl: string }> {
  const id = mintPrivateProjectId();
  const token = mintPrivateProjectToken();
  await db.insert(privateProjectsTable).values({
    id,
    userId: input.userId,
    trackId: input.trackId,
    token,
    status: "pending",
  });

  const stripe = await getUncachableStripeClient();
  const priceId = await getOrCreatePrivateProjectPrice(stripe);
  const base = privateProjectOrigin();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: id,
      metadata: { privateProjectId: id },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/share-complete?projectId=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/share-complete?projectId=${encodeURIComponent(id)}&cancelled=1`,
    },
    { idempotencyKey: `mapper-private-project-checkout-${id}` },
  );

  if (!session.url) throw new Error("Stripe returned no checkout URL");

  await db
    .update(privateProjectsTable)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(privateProjectsTable.id, id));

  return { projectId: id, checkoutUrl: session.url };
}

/**
 * Server-side payment confirmation. The browser can suggest a Checkout session
 * id, but this is the only code path that turns a pending project into active.
 */
export async function activatePrivateProjectFromCheckoutSession(
  sessionId: string,
): Promise<PrivateProjectRow | null> {
  const [project] = await db
    .select()
    .from(privateProjectsTable)
    .where(eq(privateProjectsTable.stripeCheckoutSessionId, sessionId));
  if (!project) return null;

  if (project.status === "active" || project.status === "revoked") return project;

  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const belongsToProject =
    session.client_reference_id === project.id &&
    session.metadata?.privateProjectId === project.id;
  if (!belongsToProject || session.payment_status !== "paid") return project;

  const paidAt = new Date();
  const expiresAt = new Date(
    paidAt.getTime() + PRIVATE_PROJECT_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );
  const [activated] = await db
    .update(privateProjectsTable)
    .set({ status: "active", paidAt, expiresAt })
    .where(
      and(
        eq(privateProjectsTable.id, project.id),
        eq(privateProjectsTable.status, "pending"),
      ),
    )
    .returning();

  if (activated) return activated;
  const [current] = await db
    .select()
    .from(privateProjectsTable)
    .where(eq(privateProjectsTable.id, project.id));
  return current ?? null;
}

export async function getActivePrivateProjectRoute(token: string) {
  const [row] = await db
    .select({ project: privateProjectsTable, track: tracksTable })
    .from(privateProjectsTable)
    .innerJoin(tracksTable, eq(privateProjectsTable.trackId, tracksTable.id))
    .where(
      and(
        eq(privateProjectsTable.token, token),
        eq(privateProjectsTable.status, "active"),
        gt(privateProjectsTable.expiresAt, new Date()),
      ),
    );
  if (!row) return null;

  const waypoints = await db
    .select({
      id: waypointsTable.id,
      name: waypointsTable.name,
      latitude: waypointsTable.latitude,
      longitude: waypointsTable.longitude,
      notes: waypointsTable.notes,
      photoUrl: waypointsTable.photoUrl,
      createdAt: waypointsTable.createdAt,
    })
    .from(waypointsTable)
    .where(
      and(
        eq(waypointsTable.trackId, row.track.id),
        eq(waypointsTable.userId, row.project.userId),
      ),
    );

  return { ...row, waypoints };
}

export function privateProjectWaypointPhotoUrl(
  token: string,
  waypointId: string,
): string {
  return `${privateProjectOrigin()}/api/private-projects/${encodeURIComponent(token)}/waypoints/${encodeURIComponent(waypointId)}/photo`;
}