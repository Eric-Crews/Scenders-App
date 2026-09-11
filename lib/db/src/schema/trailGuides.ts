import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Owner-approved, public-only trail-guide records. A source can be either a
 * community dataset or an explicitly public shared track; runtime checks always
 * re-confirm that the source remains public before it is rendered or indexed.
 */
export const trailGuidesTable = pgTable(
  "trail_guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceId: text("source_id").notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    title: text("title"),
    excerpt: text("excerpt"),
    content: jsonb("content"),
    sources: jsonb("sources").notNull().default([]),
    researchFetchedAt: timestamp("research_fetched_at", { withTimezone: true }),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("trail_guides_slug_idx").on(t.slug),
    uniqueIndex("trail_guides_source_idx").on(t.sourceType, t.sourceId),
    index("trail_guides_status_idx").on(t.status),
  ],
);

export type TrailGuideRow = typeof trailGuidesTable.$inferSelect;