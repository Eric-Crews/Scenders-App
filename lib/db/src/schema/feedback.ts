import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const feedbackPostsTable = pgTable("feedback_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorName: text("author_name").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  upvotes: integer("upvotes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const feedbackRepliesTable = pgTable(
  "feedback_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull(),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("feedback_replies_post_idx").on(t.postId)],
);

export const feedbackVotesTable = pgTable(
  "feedback_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull(),
    clientId: text("client_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("feedback_votes_post_client_idx").on(t.postId, t.clientId)],
);

/**
 * Private support requests are intentionally separate from community feedback.
 * They may contain diagnostic and contact details that must never be exposed in
 * a public discussion response.
 */
export const supportRequestsTable = pgTable(
  "support_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 32 }).notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    summary: varchar("summary", { length: 180 }).notNull(),
    description: text("description").notNull(),
    reproductionSteps: text("reproduction_steps"),
    expectedBehavior: text("expected_behavior"),
    actualBehavior: text("actual_behavior"),
    context: text("context"),
    environment: varchar("environment", { length: 500 }),
    contactEmail: varchar("contact_email", { length: 254 }),
    mediaUrl: varchar("media_url", { length: 2000 }),
    status: varchar("status", { length: 16 }).notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("support_requests_reference_idx").on(t.reference),
    index("support_requests_created_idx").on(t.createdAt),
    index("support_requests_status_created_idx").on(t.status, t.createdAt),
  ],
);

export type FeedbackPost = typeof feedbackPostsTable.$inferSelect;
export type FeedbackReply = typeof feedbackRepliesTable.$inferSelect;
export type FeedbackVote = typeof feedbackVotesTable.$inferSelect;
export type SupportRequest = typeof supportRequestsTable.$inferSelect;
