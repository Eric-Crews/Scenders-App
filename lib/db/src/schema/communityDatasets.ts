import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const communityDatasetsTable = pgTable("community_datasets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  format: text("format").notNull(),
  author: text("author"),
  geojson: jsonb("geojson").notNull(),
  featureCount: integer("feature_count").notNull().default(0),
  boundsWest: real("bounds_west"),
  boundsSouth: real("bounds_south"),
  boundsEast: real("bounds_east"),
  boundsNorth: real("bounds_north"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  region: text("region"),
  kind: text("kind"),
  downloadCount: integer("download_count").notNull().default(0),
  distanceMeters: real("distance_meters"),
  elevationGainMeters: real("elevation_gain_meters"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCommunityDatasetSchema = createInsertSchema(
  communityDatasetsTable,
).omit({ id: true, createdAt: true, downloadCount: true });
export type InsertCommunityDataset = z.infer<
  typeof insertCommunityDatasetSchema
>;
export type CommunityDataset = typeof communityDatasetsTable.$inferSelect;
