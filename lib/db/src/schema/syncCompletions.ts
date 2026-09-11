import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const syncCompletionsTable = pgTable(
  "sync_completions",
  {
    source: text("source").notNull(),
    region: text("region").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    recordCount: integer("record_count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.source, t.region] })],
);

export type SyncCompletion = typeof syncCompletionsTable.$inferSelect;
