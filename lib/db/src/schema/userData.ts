import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const waypointsTable = pgTable(
  "waypoints",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    notes: text("notes"),
    trackId: varchar("track_id"),
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("waypoints_user_idx").on(t.userId),
    index("waypoints_track_idx").on(t.trackId),
  ],
);

export type WaypointRow = typeof waypointsTable.$inferSelect;

export const userDatasetsTable = pgTable(
  "user_datasets",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    format: varchar("format", { length: 16 }).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#2f6b46"),
    visible: integer("visible").notNull().default(1),
    featureCount: integer("feature_count").notNull().default(0),
    sizeBytes: integer("size_bytes").notNull().default(0),
    boundsWest: doublePrecision("bounds_west"),
    boundsSouth: doublePrecision("bounds_south"),
    boundsEast: doublePrecision("bounds_east"),
    boundsNorth: doublePrecision("bounds_north"),
    communityId: varchar("community_id"),
    geojson: jsonb("geojson").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("user_datasets_user_idx").on(t.userId)],
);

export type UserDatasetRow = typeof userDatasetsTable.$inferSelect;

export const offlineRegionsTable = pgTable(
  "offline_regions",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    boundsWest: doublePrecision("bounds_west").notNull(),
    boundsSouth: doublePrecision("bounds_south").notNull(),
    boundsEast: doublePrecision("bounds_east").notNull(),
    boundsNorth: doublePrecision("bounds_north").notNull(),
    minZoom: integer("min_zoom").notNull(),
    maxZoom: integer("max_zoom").notNull(),
    tileCount: integer("tile_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("offline_regions_user_idx").on(t.userId)],
);

export type OfflineRegionRow = typeof offlineRegionsTable.$inferSelect;

export const tracksTable = pgTable(
  "tracks",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: varchar("color", { length: 16 }).notNull().default("#c8633a"),
    kind: varchar("kind", { length: 16 }).notNull().default("recorded"),
    distanceMeters: real("distance_meters").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    pointCount: integer("point_count").notNull().default(0),
    points: jsonb("points").notNull(),
    // Link sharing: when shareToken is set the track is reachable by anyone
    // holding the unguessable token at /r/<token>. shareVisibility is
    // "private" (secret link only) or "public" (link + listed in community).
    shareToken: varchar("share_token"),
    shareVisibility: varchar("share_visibility", { length: 16 }),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tracks_user_idx").on(t.userId),
    uniqueIndex("tracks_share_token_idx").on(t.shareToken),
  ],
);

export type TrackRow = typeof tracksTable.$inferSelect;

/**
 * A live activity is intentionally separate from saved tracks and their
 * share-token surface. Its token is a private capability link for one trusted
 * recipient; points arrive incrementally while a recording is in progress.
 */
export const liveActivitiesTable = pgTable(
  "live_activities",
  {
    id: varchar("id").primaryKey(),
    ownerId: varchar("owner_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    // New sessions are controlled by a device-held capability. Keep this
    // nullable so existing account-owned sessions continue using ownerId.
    ownerCapabilityHash: varchar("owner_capability_hash", { length: 64 }),
    token: varchar("token", { length: 96 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    // Nullable so links created before personal display names remain readable.
    ownerDisplayName: varchar("owner_display_name", { length: 80 }),
    // A bounded copy of the route being followed when sharing starts. It is
    // deliberately stored on the private activity rather than linked back to
    // the recorder's library, so later library edits cannot change this view.
    followedRoute: jsonb("followed_route"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
    distanceMeters: real("distance_meters").notNull().default(0),
    pointCount: integer("point_count").notNull().default(0),
    // We intentionally retain no recipient phone number. These fields enforce
    // the resend limit without making a contact address part of route data.
    smsSendCount: integer("sms_send_count").notNull().default(0),
    smsLastSentAt: timestamp("sms_last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("live_activities_token_idx").on(t.token),
    index("live_activities_owner_idx").on(t.ownerId, t.createdAt),
  ],
);

export const liveActivityPointsTable = pgTable(
  "live_activity_points",
  {
    id: varchar("id").primaryKey(),
    activityId: varchar("activity_id")
      .notNull()
      .references(() => liveActivitiesTable.id, { onDelete: "cascade" }),
    // The device generates this durable id before upload so a queued retry is
    // idempotent even if it arrives after a timeout.
    clientPointId: varchar("client_point_id", { length: 96 }).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    altitude: doublePrecision("altitude"),
    accuracy: doublePrecision("accuracy"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("live_activity_points_activity_client_idx").on(
      t.activityId,
      t.clientPointId,
    ),
    index("live_activity_points_activity_captured_idx").on(
      t.activityId,
      t.capturedAt,
    ),
  ],
);

/**
 * Waypoints created while an activity is actively shared. They are a separate
 * private snapshot: deleting or editing a library waypoint later must not
 * rewrite what the recipient saw during the live activity.
 */
export const liveActivityWaypointsTable = pgTable(
  "live_activity_waypoints",
  {
    id: varchar("id").primaryKey(),
    activityId: varchar("activity_id")
      .notNull()
      .references(() => liveActivitiesTable.id, { onDelete: "cascade" }),
    clientWaypointId: varchar("client_waypoint_id", { length: 96 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    notes: text("notes"),
    photoPath: text("photo_path"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("live_activity_waypoints_activity_client_idx").on(
      t.activityId,
      t.clientWaypointId,
    ),
    index("live_activity_waypoints_activity_captured_idx").on(
      t.activityId,
      t.capturedAt,
    ),
  ],
);

export const liveActivityMessagesTable = pgTable(
  "live_activity_messages",
  {
    id: varchar("id").primaryKey(),
    activityId: varchar("activity_id")
      .notNull()
      .references(() => liveActivitiesTable.id, { onDelete: "cascade" }),
    sender: varchar("sender", { length: 16 }).notNull(),
    // Recorder replies carry this durable device id so a retry after a lost
    // response cannot create a duplicate message. Viewer messages stay null.
    clientMessageId: varchar("client_message_id", { length: 96 }),
    // Viewer names are self-asserted labels, never account identity.
    displayName: varchar("display_name", { length: 80 }),
    body: varchar("body", { length: 280 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("live_activity_messages_activity_client_idx").on(
      t.activityId,
      t.clientMessageId,
    ),
    index("live_activity_messages_activity_created_idx").on(t.activityId, t.createdAt),
  ],
);

export type LiveActivityRow = typeof liveActivitiesTable.$inferSelect;

// Suppress lint for sql helper used only when default expressions need it later.
void sql;
