import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { tracksTable } from "./userData";
import { usersTable } from "./auth";

/**
 * A paid, time-bounded project link. This is deliberately separate from the
 * legacy route-share token: payment, expiry, and revocation must be enforced
 * independently from public route publishing.
 */
export const privateProjectsTable = pgTable(
  "private_projects",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    trackId: varchar("track_id")
      .notNull()
      .references(() => tracksTable.id, { onDelete: "cascade" }),
    token: varchar("token").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id"),
    activationSource: varchar("activation_source", { length: 16 })
      .notNull()
      .default("stripe"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("private_projects_user_idx").on(t.userId),
    index("private_projects_track_idx").on(t.trackId),
    uniqueIndex("private_projects_token_idx").on(t.token),
    uniqueIndex("private_projects_stripe_session_idx").on(
      t.stripeCheckoutSessionId,
    ),
  ],
);

export type PrivateProjectRow = typeof privateProjectsTable.$inferSelect;