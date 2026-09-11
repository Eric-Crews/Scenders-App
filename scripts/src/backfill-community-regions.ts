/**
 * backfill-community-regions.ts
 *
 * One-off backfill: populate the `region` column on existing community datasets
 * that predate region tagging. The region is derived from each dataset's
 * bounding-box centroid via @workspace/geo (US state, else country).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run backfill-community-regions
 *   pnpm --filter @workspace/scripts run backfill-community-regions -- --dry-run
 *
 * Re-running is safe: only rows where region IS NULL and bounds are present are
 * considered. The prod database is backfilled separately (post-merge).
 */

import { db, communityDatasetsTable } from "@workspace/db";
import { regionForPoint } from "@workspace/geo";
import { and, eq, isNull, isNotNull } from "drizzle-orm";

const isDryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const rows = await db
    .select({
      id: communityDatasetsTable.id,
      name: communityDatasetsTable.name,
      boundsWest: communityDatasetsTable.boundsWest,
      boundsSouth: communityDatasetsTable.boundsSouth,
      boundsEast: communityDatasetsTable.boundsEast,
      boundsNorth: communityDatasetsTable.boundsNorth,
    })
    .from(communityDatasetsTable)
    .where(
      and(
        isNull(communityDatasetsTable.region),
        isNotNull(communityDatasetsTable.boundsNorth),
      ),
    );

  console.log(`Found ${rows.length} dataset(s) without a region.`);

  let matched = 0;
  let unmatched = 0;

  for (const row of rows) {
    const { boundsWest: w, boundsSouth: s, boundsEast: e, boundsNorth: n } = row;
    if (w === null || s === null || e === null || n === null) {
      unmatched++;
      continue;
    }
    const centerLat = (n + s) / 2;
    const centerLng = (e + w) / 2;
    const region = regionForPoint(centerLat, centerLng)?.name ?? null;

    if (region === null) {
      unmatched++;
      console.log(`  [no region] ${row.name} (${centerLat.toFixed(3)}, ${centerLng.toFixed(3)})`);
      continue;
    }

    matched++;
    console.log(`  ${region} <- ${row.name}`);
    if (!isDryRun) {
      await db
        .update(communityDatasetsTable)
        .set({ region })
        .where(eq(communityDatasetsTable.id, row.id));
    }
  }

  console.log(
    `\n${isDryRun ? "[dry-run] would update" : "Updated"} ${matched} row(s); ${unmatched} left without a region.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
