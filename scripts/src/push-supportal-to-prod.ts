/**
 * push-supportal-to-prod.ts
 *
 * Reads already-parsed Supportal GPX datasets from the local dev DB and
 * batch-posts them to the production API, skipping the slow re-download /
 * re-parse step.
 *
 * Usage:
 *   PROD_API=https://mapper.one pnpm --filter @workspace/scripts run push-supportal-to-prod
 *   PROD_API=https://mapper.one pnpm --filter @workspace/scripts run push-supportal-to-prod -- --dry-run
 */

import { db, communityDatasetsTable } from "@workspace/db";
import { like } from "drizzle-orm";

const PROD_API = process.env.PROD_API ?? "https://mapper.one";
const BULK_ENDPOINT = `${PROD_API}/api/community/datasets/bulk`;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "20", 10);
const isDryRun = process.argv.includes("--dry-run");

async function fetchExistingProdIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const res = await fetch(`${PROD_API}/api/community/datasets`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return ids;
  const rows = (await res.json()) as Array<{ description: string | null }>;
  for (const row of rows) {
    const match = row.description?.match(/\[supportal:([^\]]+)\]/);
    if (match) ids.add(match[1]);
  }
  return ids;
}

async function main() {
  console.log(`\nmapper.one → prod Supportal push  ${isDryRun ? "(DRY RUN)" : ""}`);
  console.log(`Target: ${BULK_ENDPOINT}`);
  console.log("=".repeat(60));

  console.log("\n1. Reading existing Supportal tracks from dev DB…");
  const rows = await db
    .select({
      name: communityDatasetsTable.name,
      description: communityDatasetsTable.description,
      format: communityDatasetsTable.format,
      author: communityDatasetsTable.author,
      geojson: communityDatasetsTable.geojson,
    })
    .from(communityDatasetsTable)
    .where(like(communityDatasetsTable.description, "%[supportal:%"));
  console.log(`   ${rows.length} Supportal track(s) in dev DB.`);
  if (!rows.length) {
    console.log("Nothing to push.");
    return;
  }

  console.log("\n2. Checking which Supportal IDs are already in production…");
  const existingProdIds = await fetchExistingProdIds();
  console.log(`   ${existingProdIds.size} Supportal track(s) already in prod.`);

  const toUpload = rows.filter((r) => {
    const match = r.description?.match(/\[supportal:([^\]]+)\]/);
    return match ? !existingProdIds.has(match[1]) : true;
  });

  const skipCount = rows.length - toUpload.length;
  if (skipCount > 0) console.log(`   Skipping ${skipCount} already-imported track(s).`);
  if (!toUpload.length) {
    console.log("\nProduction is already up to date.");
    return;
  }
  console.log(`   ${toUpload.length} track(s) to push.`);

  if (isDryRun) {
    console.log("\nDry run — exiting without uploading.");
    return;
  }

  console.log(`\n3. Uploading in batches of ${BATCH_SIZE}…`);
  let succeeded = 0;
  let failed = 0;
  const totalBatches = Math.ceil(toUpload.length / BATCH_SIZE);

  for (let i = 0; i < toUpload.length; i += BATCH_SIZE) {
    const batch = toUpload.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${batch.length} tracks)… `);
    try {
      const res = await fetch(BULK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasets: batch }),
      });
      if (!res.ok) {
        const err = await res.text();
        process.stdout.write(`ERROR ${res.status}: ${err.slice(0, 100)}\n`);
        failed += batch.length;
        continue;
      }
      const json = (await res.json()) as { results: Array<{ success: boolean; error?: string }> };
      const batchOk = json.results.filter((r) => r.success).length;
      const batchFail = json.results.filter((r) => !r.success).length;
      succeeded += batchOk;
      failed += batchFail;
      process.stdout.write(`${batchOk} OK${batchFail ? `, ${batchFail} failed` : ""}\n`);
    } catch (err) {
      process.stdout.write(`NETWORK ERROR: ${String(err)}\n`);
      failed += batch.length;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Results:");
  console.log(`  Pushed:       ${succeeded}`);
  if (failed > 0) console.log(`  Failed:       ${failed}`);
  if (skipCount > 0) console.log(`  Already had:  ${skipCount}`);
  console.log(`  Total in dev: ${rows.length}`);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
