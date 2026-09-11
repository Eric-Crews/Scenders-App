import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const earlyAccessLeadsTable = pgTable(
  "early_access_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    source: text("source").notNull().default("teams_landing_page"),
    consentedAt: timestamp("consented_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("early_access_leads_email_idx").on(t.email)],
);

export type EarlyAccessLead = typeof earlyAccessLeadsTable.$inferSelect;