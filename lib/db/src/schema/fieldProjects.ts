import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { tracksTable } from "./userData";

export const fieldProjectsTable = pgTable(
  "field_projects",
  {
    id: varchar("id").primaryKey(),
    ownerId: varchar("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 4000 }),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("field_projects_owner_idx").on(t.ownerId)],
);

export const fieldProjectMembersTable = pgTable(
  "field_project_members",
  {
    id: varchar("id").primaryKey(),
    projectId: varchar("project_id")
      .notNull()
      .references(() => fieldProjectsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("field_project_members_project_user_idx").on(t.projectId, t.userId),
    index("field_project_members_user_idx").on(t.userId),
  ],
);

/** Project-to-route link records keep existing recreational tracks independent. */
export const fieldProjectRoutesTable = pgTable(
  "field_project_routes",
  {
    id: varchar("id").primaryKey(),
    projectId: varchar("project_id")
      .notNull()
      .references(() => fieldProjectsTable.id, { onDelete: "cascade" }),
    trackId: varchar("track_id")
      .notNull()
      .references(() => tracksTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("field_project_routes_project_track_idx").on(t.projectId, t.trackId),
    index("field_project_routes_track_idx").on(t.trackId),
  ],
);

export const fieldProjectReportLinksTable = pgTable(
  "field_project_report_links",
  {
    id: varchar("id").primaryKey(),
    projectId: varchar("project_id")
      .notNull()
      .references(() => fieldProjectsTable.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 96 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("field_project_report_links_token_idx").on(t.token),
    index("field_project_report_links_project_idx").on(t.projectId),
  ],
);

export const fieldReportsTable = pgTable(
  "field_reports",
  {
    id: varchar("id").primaryKey(),
    projectId: varchar("project_id")
      .notNull()
      .references(() => fieldProjectsTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }),
    description: varchar("description", { length: 5000 }).notNull(),
    category: varchar("category", { length: 48 }),
    priority: varchar("priority", { length: 16 }).notNull().default("medium"),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    latitude: varchar("latitude", { length: 24 }).notNull(),
    longitude: varchar("longitude", { length: 24 }).notNull(),
    photoPaths: jsonb("photo_paths").$type<string[]>().notNull().default([]),
    resolutionNote: varchar("resolution_note", { length: 5000 }),
    resolutionPhotoPaths: jsonb("resolution_photo_paths").$type<string[]>().notNull().default([]),
    createdByUserId: varchar("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reporterLabel: varchar("reporter_label", { length: 32 }).notNull().default("team"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("field_reports_project_status_idx").on(t.projectId, t.status),
    index("field_reports_project_created_idx").on(t.projectId, t.createdAt),
  ],
);

export const fieldReportHistoryTable = pgTable(
  "field_report_history",
  {
    id: varchar("id").primaryKey(),
    reportId: varchar("report_id")
      .notNull()
      .references(() => fieldReportsTable.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 32 }).notNull(),
    note: varchar("note", { length: 5000 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("field_report_history_report_idx").on(t.reportId, t.createdAt)],
);