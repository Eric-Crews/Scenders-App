import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { db, liveActivitiesTable, usersTable } from "@workspace/db";
import {
  CreateMyLiveActivityBody,
  SendMyLiveActivityMessageBody,
  SendSharedLiveActivityMessageBody,
} from "@workspace/api-zod";
import liveActivitiesRouter from "./liveActivities";

const ownerId = randomUUID();
const activityId = randomUUID();
const token = `test-${randomUUID().replaceAll("-", "")}-${randomUUID().replaceAll("-", "")}`;
const anonymousActivityId = randomUUID();
const anonymousViewerToken = `viewer-${randomUUID().replaceAll("-", "")}-${randomUUID().replaceAll("-", "")}`;
const anonymousOwnerCapability = `owner-${randomUUID().replaceAll("-", "")}-${randomUUID().replaceAll("-", "")}`;
let server: ReturnType<typeof express.application.listen>;
let baseUrl = "";

function capabilityHash(capability: string): string {
  return createHash("sha256").update(capability, "utf8").digest("hex");
}

before(async () => {
  await db.insert(usersTable).values({ id: ownerId });
  await db.insert(liveActivitiesTable).values({
    id: activityId,
    ownerId,
    token,
    name: "Contract test activity",
    status: "active",
  });
  await db.insert(liveActivitiesTable).values({
    id: anonymousActivityId,
    token: anonymousViewerToken,
    ownerCapabilityHash: capabilityHash(anonymousOwnerCapability),
    name: "Anonymous activity",
    status: "active",
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const authenticated = req.header("authorization") === "Bearer owner-test";
    const request = req as unknown as {
      user?: { id: string };
      isAuthenticated: () => boolean;
    };
    request.isAuthenticated = () => authenticated;
    request.user = authenticated ? { id: ownerId } : undefined;
    next();
  });
  app.use(liveActivitiesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await db.delete(liveActivitiesTable).where(eq(liveActivitiesTable.id, anonymousActivityId));
  await db.delete(usersTable).where(eq(usersTable.id, ownerId));
});

test("live owner capability routes before account-only /me routes", () => {
  const apiRouterSource = readFileSync(
    resolve(process.cwd(), "src/routes/index.ts"),
    "utf8",
  );
  const liveRouterIndex = apiRouterSource.indexOf("router.use(liveActivitiesRouter);");
  const meRouterIndex = apiRouterSource.indexOf("router.use(meRouter);");

  assert.ok(liveRouterIndex >= 0, "the live activity router is registered");
  assert.ok(meRouterIndex >= 0, "the account-only /me router is registered");
  assert.ok(
    liveRouterIndex < meRouterIndex,
    "owner capability routes must be registered before the account-only /me guard",
  );
  assert.equal(
    apiRouterSource.indexOf("router.use(liveActivitiesRouter);", liveRouterIndex + 1),
    -1,
    "the live activity router is registered once",
  );
});

test("anonymous creation returns a separate owner capability exactly once", async () => {
  const created = await fetch(`${baseUrl}/live-activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Created without account",
      ownerDisplayName: "Riley",
      followedRoute: {
        name: "Creek Trail",
        points: [
          { lat: 47.6205, lng: -122.3493 },
          { lat: 47.621, lng: -122.35 },
        ],
      },
    }),
  });
  assert.equal(created.status, 201);
  const body = (await created.json()) as {
    id: string;
    token: string;
    ownerCapability?: string;
    ownerDisplayName: string;
    followedRoute: { name: string; points: Array<{ lat: number; lng: number }> } | null;
  };
  assert.ok(body.ownerCapability);
  assert.notEqual(body.ownerCapability, body.token);
  assert.ok(body.ownerCapability.length >= 40);
  assert.equal(body.ownerDisplayName, "Riley");
  assert.equal(body.followedRoute?.name, "Creek Trail");
  const [stored] = await db
    .select()
    .from(liveActivitiesTable)
    .where(eq(liveActivitiesTable.id, body.id));
  assert.equal(stored.ownerId, null);
  assert.equal(stored.ownerCapabilityHash, capabilityHash(body.ownerCapability));
  assert.equal(stored.ownerDisplayName, "Riley");
  assert.deepEqual(stored.followedRoute, body.followedRoute);
  const tokenRead = await fetch(`${baseUrl}/shared/live/${body.token}`);
  assert.equal(tokenRead.status, 200);
  const tokenBody = (await tokenRead.json()) as Record<string, unknown>;
  assert.equal(tokenBody.ownerDisplayName, "Riley");
  assert.deepEqual(tokenBody.followedRoute, body.followedRoute);
  assert.equal("id" in tokenBody, false, "the followed route stays behind the private token");

  const refreshed = await fetch(`${baseUrl}/me/live-activities/${body.id}`, {
    headers: { "X-Live-Owner-Capability": body.ownerCapability },
  });
  assert.equal(refreshed.status, 200);
  assert.equal("ownerCapability" in (await refreshed.json() as Record<string, unknown>), false);
  await db.delete(liveActivitiesTable).where(eq(liveActivitiesTable.id, body.id));
});

test("display names validate without becoming account identity", () => {
  assert.equal(
    CreateMyLiveActivityBody.safeParse({
      name: "Morning hike",
      ownerDisplayName: "Riley",
    }).success,
    true,
  );
  assert.equal(
    SendSharedLiveActivityMessageBody.safeParse({
      message: "Looking good",
      displayName: "Mira",
    }).success,
    true,
  );
  assert.equal(
    SendSharedLiveActivityMessageBody.safeParse({ message: "Looking good" }).success,
    false,
  );
});

test("recipient page asks for a local message label and distinguishes route lines", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "src/routes/sharePage.ts"), "utf8");
  assert.match(pageSource, /id="viewer-name"/);
  assert.match(pageSource, /mapper\.one\.live\.viewer-name\.v1/);
  assert.match(pageSource, /Recorded path/);
  assert.match(pageSource, /followedRoute/);
  assert.match(pageSource, /New waypoint added/);
});

test("a recorder's new waypoint reaches the private viewer exactly once", async () => {
  const body = {
    id: "waypoint-001",
    name: "Water crossing",
    lat: 40.123,
    lng: -105.456,
    notes: "Bridge is out.",
    photoPath: null,
    t: Date.now(),
  };
  for (const attempt of [body, body]) {
    const response = await fetch(`${baseUrl}/me/live-activities/${activityId}/waypoints`, {
      method: "POST",
      headers: { Authorization: "Bearer owner-test", "Content-Type": "application/json" },
      body: JSON.stringify(attempt),
    });
    assert.equal(response.status, 201);
  }
  const response = await fetch(`${baseUrl}/shared/live/${token}`);
  const shared = (await response.json()) as {
    waypoints: Array<{ name: string; notes: string | null; photoUrl: string | null }>;
  };
  assert.equal(shared.waypoints.length, 1);
  assert.equal(shared.waypoints[0]?.name, "Water crossing");
  assert.equal(shared.waypoints[0]?.notes, "Bridge is out.");
  assert.equal(shared.waypoints[0]?.photoUrl, null);
});

test("owner reply contract requires a stable client delivery id", () => {
  assert.equal(
    SendMyLiveActivityMessageBody.safeParse({ message: "I can see you." }).success,
    false,
  );
  assert.equal(
    SendMyLiveActivityMessageBody.safeParse({
      message: "I can see you.",
      clientMessageId: "owner-message-001",
    }).success,
    true,
  );
});

test("legacy account ownership remains available and viewer data stays private", async () => {
  const unauthenticated = await fetch(`${baseUrl}/me/live-activities/${activityId}`);
  assert.equal(unauthenticated.status, 404);

  const point = {
    id: "device-point-001",
    lat: 47.6205,
    lng: -122.3493,
    t: Date.now(),
    acc: 8,
  };
  for (const body of [{ points: [point] }, { points: [point] }]) {
    const uploaded = await fetch(`${baseUrl}/me/live-activities/${activityId}/points`, {
      method: "POST",
      headers: { Authorization: "Bearer owner-test", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(uploaded.status, 200);
  }

  const shared = await fetch(`${baseUrl}/shared/live/${token}`);
  assert.equal(shared.status, 200);
  assert.equal(shared.headers.get("cache-control"), "private, no-store");
  const sharedBody = (await shared.json()) as Record<string, unknown>;
  assert.equal(sharedBody.pointCount, 1, "replayed client point ids stay idempotent");
  assert.equal("id" in sharedBody, false);
  assert.equal("token" in sharedBody, false);
  assert.equal("ownerCapability" in sharedBody, false);
  assert.equal(sharedBody.ownerDisplayName, "Recorder", "legacy links get a safe recorder fallback");
  assert.equal(sharedBody.followedRoute, null, "legacy links have no planned trail");

  const viewerMessage = await fetch(`${baseUrl}/shared/live/${token}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Made it to the trailhead.",
      displayName: "Mira",
    }),
  });
  assert.equal(viewerMessage.status, 201);
  const secondViewerMessage = await fetch(`${baseUrl}/shared/live/${token}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "I have the water.",
      displayName: "Jordan",
    }),
  });
  assert.equal(secondViewerMessage.status, 201);
  const unnamedViewerMessage = await fetch(`${baseUrl}/shared/live/${token}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "I forgot to identify myself." }),
  });
  assert.equal(unnamedViewerMessage.status, 400);
  const blankNameMessage = await fetch(`${baseUrl}/shared/live/${token}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "I am blank.", displayName: "   " }),
  });
  assert.equal(blankNameMessage.status, 400);
  const sharedConversation = (await (
    await fetch(`${baseUrl}/shared/live/${token}`)
  ).json()) as { messages: Array<{ sender: string; body: string; displayName: string | null }> };
  assert.ok(
    sharedConversation.messages.some(
      (message) =>
        message.sender === "viewer" &&
        message.body === "Made it to the trailhead." &&
        message.displayName === "Mira",
    ),
    "viewer messages retain the self-provided label",
  );
  assert.ok(
    sharedConversation.messages.some(
      (message) =>
        message.sender === "viewer" &&
        message.body === "I have the water." &&
        message.displayName === "Jordan",
    ),
    "several token holders can be distinguished in one conversation",
  );

  const owner = await fetch(`${baseUrl}/me/live-activities/${activityId}`, {
    headers: { Authorization: "Bearer owner-test" },
  });
  const ownerBody = (await owner.json()) as { messages: Array<{ sender: string; body: string }> };
  assert.ok(ownerBody.messages.some((message) => message.sender === "viewer"));
});

test("anonymous owner capability is distinct from the viewer link and controls all owner actions", async () => {
  assert.notEqual(anonymousOwnerCapability, anonymousViewerToken);
  const viewerHeaders = { "X-Live-Owner-Capability": anonymousViewerToken };
  const ownerHeaders = {
    "X-Live-Owner-Capability": anonymousOwnerCapability,
    "Content-Type": "application/json",
  };

  const ownerPaths = [
    {
      url: `/me/live-activities/${anonymousActivityId}`,
      init: {},
    },
    {
      url: `/me/live-activities/${anonymousActivityId}/points`,
      init: {
        method: "POST",
        headers: { ...viewerHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          points: [{ id: "anonymous-rejected-point", lat: 47.61, lng: -122.35, t: Date.now() }],
        }),
      },
    },
    {
      url: `/me/live-activities/${anonymousActivityId}/messages`,
      init: {
        method: "POST",
        headers: { ...viewerHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Viewer token cannot reply as owner." }),
      },
    },
    {
      url: `/me/live-activities/${anonymousActivityId}/end`,
      init: { method: "POST", headers: viewerHeaders },
    },
    {
      url: `/me/live-activities/${anonymousActivityId}/revoke`,
      init: { method: "POST", headers: viewerHeaders },
    },
  ];
  for (const attempt of ownerPaths) {
    const response = await fetch(`${baseUrl}${attempt.url}`, attempt.init);
    assert.equal(response.status, 404, `${attempt.url} rejects the viewer capability`);
  }

  const owner = await fetch(`${baseUrl}/me/live-activities/${anonymousActivityId}`, {
    headers: viewerHeaders,
  });
  assert.equal(owner.status, 404);
  const authorizedOwner = await fetch(`${baseUrl}/me/live-activities/${anonymousActivityId}`, {
    headers: ownerHeaders,
  });
  assert.equal(authorizedOwner.status, 200);

  const point = { id: "anonymous-device-point", lat: 47.61, lng: -122.35, t: Date.now() };
  for (const body of [{ points: [point] }, { points: [point] }]) {
    const uploaded = await fetch(`${baseUrl}/me/live-activities/${anonymousActivityId}/points`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify(body),
    });
    assert.equal(uploaded.status, 200);
  }

  const shared = await fetch(`${baseUrl}/shared/live/${anonymousViewerToken}`);
  const sharedBody = (await shared.json()) as Record<string, unknown>;
  assert.equal(shared.status, 200);
  assert.equal(sharedBody.pointCount, 1, "owner capability retries keep client points idempotent");
  assert.equal("ownerCapability" in sharedBody, false);

  const ownerReply = await fetch(`${baseUrl}/me/live-activities/${anonymousActivityId}/messages`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      message: "I can see you.",
      clientMessageId: "anonymous-owner-message-001",
    }),
  });
  assert.equal(ownerReply.status, 201);
  const retriedOwnerReply = await fetch(`${baseUrl}/me/live-activities/${anonymousActivityId}/messages`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      message: "I can see you.",
      clientMessageId: "anonymous-owner-message-001",
    }),
  });
  assert.equal(retriedOwnerReply.status, 201, "a lost owner response can be retried safely");
  const sharedConversation = (await (
    await fetch(`${baseUrl}/shared/live/${anonymousViewerToken}`)
  ).json()) as { messages: Array<{ sender: string; body: string }> };
  assert.ok(
    sharedConversation.messages.some(
      (message) => message.sender === "owner" && message.body === "I can see you.",
    ),
    "an anonymous owner reply is visible to the token holder",
  );
  assert.equal(
    sharedConversation.messages.filter(
      (message) => message.sender === "owner" && message.body === "I can see you.",
    ).length,
    1,
    "the stable client message id prevents duplicate replies after a retry",
  );

  const completed = await fetch(`${baseUrl}/me/live-activities/${anonymousActivityId}/end`, {
    method: "POST",
    headers: viewerHeaders,
  });
  assert.equal(completed.status, 404);
  const authorizedCompletion = await fetch(`${baseUrl}/me/live-activities/${anonymousActivityId}/end`, {
    method: "POST",
    headers: ownerHeaders,
  });
  assert.equal(authorizedCompletion.status, 200);
  assert.equal((await authorizedCompletion.json() as { status: string }).status, "completed");

  const revoked = await fetch(`${baseUrl}/me/live-activities/${anonymousActivityId}/revoke`, {
    method: "POST",
    headers: ownerHeaders,
  });
  assert.equal(revoked.status, 204);
  assert.equal((await fetch(`${baseUrl}/shared/live/${anonymousViewerToken}`)).status, 404);
});

test("completed links are view-only and revoked links disappear", async () => {
  // The point write and terminal transition deliberately race. The row lock
  // permits one coherent order: either the point lands before completion or
  // it is rejected once completion wins, never an append after completion.
  const [racingUpload, ended] = await Promise.all([
    fetch(`${baseUrl}/me/live-activities/${activityId}/points`, {
      method: "POST",
      headers: { Authorization: "Bearer owner-test", "Content-Type": "application/json" },
      body: JSON.stringify({
        points: [{ id: "device-point-racing", lat: 47.621, lng: -122.35, t: Date.now() }],
      }),
    }),
    fetch(`${baseUrl}/me/live-activities/${activityId}/end`, {
      method: "POST",
      headers: { Authorization: "Bearer owner-test" },
    }),
  ]);
  assert.ok([200, 400].includes(racingUpload.status));
  assert.equal(ended.status, 200);
  assert.equal((await ended.json() as { status: string }).status, "completed");

  const completed = await fetch(`${baseUrl}/shared/live/${token}`);
  assert.equal(completed.status, 200);
  assert.equal((await completed.json() as { status: string }).status, "completed");

  const postCompletionUpload = await fetch(`${baseUrl}/me/live-activities/${activityId}/points`, {
    method: "POST",
    headers: { Authorization: "Bearer owner-test", "Content-Type": "application/json" },
    body: JSON.stringify({
      points: [{ id: "device-point-after-end", lat: 47.622, lng: -122.351, t: Date.now() }],
    }),
  });
  assert.equal(postCompletionUpload.status, 400);

  const lateMessage = await fetch(`${baseUrl}/shared/live/${token}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "This should be rejected.",
      displayName: "Mira",
    }),
  });
  assert.equal(lateMessage.status, 404);

  const revoked = await fetch(`${baseUrl}/me/live-activities/${activityId}/revoke`, {
    method: "POST",
    headers: { Authorization: "Bearer owner-test" },
  });
  assert.equal(revoked.status, 204);
  assert.equal((await fetch(`${baseUrl}/shared/live/${token}`)).status, 404);
});