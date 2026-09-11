/**
 * sync-supportal.ts
 *
 * Fetches every GPX trail from the Supportal API, parses each one to
 * GeoJSON in-process, then bulk-imports them into the mapper.one community
 * library via POST /api/community/datasets/bulk.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run sync-supportal
 *   pnpm --filter @workspace/scripts run sync-supportal -- --dry-run
 *
 * Re-running is safe: tracks whose Supportal ID is already in the community
 * library (detected via the description field) are skipped.
 */

import { DOMParser } from "@xmldom/xmldom";
import { createRequire } from "module";
import { db, communityDatasetsTable } from "@workspace/db";
import { like } from "drizzle-orm";
const _require = createRequire(import.meta.url);
const toGeoJSON = _require("@mapbox/togeojson") as {
  gpx: (doc: Document) => { type: string; features: unknown[] };
};

const SUPPORTAL_BASE = "https://api.supportal.ai/api/trails/gpx";
const BULK_ENDPOINT =
  process.env.BULK_URL ?? "http://localhost:80/api/community/datasets/bulk";
const PAGE_LIMIT = 20;
const BATCH_SIZE = 20;
const AUTHOR = "Adventure Collective";

const isDryRun = process.argv.includes("--dry-run");
// When BULK_URL points to a remote host, query that host's list endpoint for
// existing Supportal IDs instead of the local dev database.
const isProd = !!process.env.BULK_URL;

// ---------------------------------------------------------------------------
// Supportal API types
// ---------------------------------------------------------------------------
type SupportalItem = { id: string; name: string; description: string; url: string };
type SupportalPage = {
  success: boolean;
  data: { gpx: SupportalItem[]; hasMore: boolean };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchAllSupportalTracks(): Promise<SupportalItem[]> {
  const all: SupportalItem[] = [];
  let page = 1;
  while (true) {
    const url = `${SUPPORTAL_BASE}?page=${page}&limit=${PAGE_LIMIT}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Supportal API error ${res.status} on page ${page}`);
    const json = (await res.json()) as SupportalPage;
    if (!json.success || !json.data?.gpx) break;
    all.push(...json.data.gpx);
    process.stdout.write(`  Fetched page ${page} (${json.data.gpx.length} tracks)\n`);
    if (!json.data.hasMore) break;
    page++;
  }
  return all;
}

async function fetchExistingSourceIds(): Promise<Set<string>> {
  if (isProd) {
    // Query the remote API's list endpoint — paginate until exhausted.
    const listBase = BULK_ENDPOINT.replace(/\/bulk$/, "");
    const ids = new Set<string>();
    let offset = 0;
    const limit = 200;
    while (true) {
      const res = await fetch(
        `${listBase}?limit=${limit}&offset=${offset}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) break;
      const rows = (await res.json()) as Array<{ description: string | null }>;
      for (const row of rows) {
        const match = row.description?.match(/\[supportal:([^\]]+)\]/);
        if (match) ids.add(match[1]);
      }
      if (rows.length < limit) break;
      offset += limit;
    }
    return ids;
  }
  try {
    const rows = await db
      .select({ description: communityDatasetsTable.description })
      .from(communityDatasetsTable)
      .where(like(communityDatasetsTable.description, "%[supportal:%"));
    const ids = new Set<string>();
    for (const row of rows) {
      const match = row.description?.match(/\[supportal:([^\]]+)\]/);
      if (match) ids.add(match[1]);
    }
    return ids;
  } catch {
    return new Set();
  }
}

async function downloadAndParseGpx(
  item: SupportalItem,
): Promise<{ type: string; features: unknown[] } | null> {
  try {
    const res = await fetch(item.url);
    if (!res.ok) return null;
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, "text/xml") as unknown as Document;
    const fc = toGeoJSON.gpx(doc);
    if (!fc?.features?.length) return null;
    return fc;
  } catch {
    return null;
  }
}

function buildDescription(item: SupportalItem): string {
  const parts: string[] = [];
  if (item.description?.trim()) parts.push(item.description.trim());
  parts.push(`[supportal:${item.id}]`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nmapper.one ← Supportal GPX sync  ${isDryRun ? "(DRY RUN)" : ""}`);
  console.log("=".repeat(50));

  console.log("\n1. Fetching existing community library to detect duplicates…");
  const existingIds = await fetchExistingSourceIds();
  console.log(`   ${existingIds.size} Supportal track(s) already in library.`);

  console.log("\n2. Fetching all tracks from Supportal API…");
  const allTracks = await fetchAllSupportalTracks();
  console.log(`   Total: ${allTracks.length} track(s) found.`);

  const newTracks = allTracks.filter((t) => !existingIds.has(t.id));
  const skipCount = allTracks.length - newTracks.length;
  if (skipCount > 0) console.log(`   Skipping ${skipCount} already-imported track(s).`);
  if (!newTracks.length) {
    console.log("\nNothing to import — library is up to date.");
    return;
  }
  console.log(`   ${newTracks.length} new track(s) to import.`);

  console.log("\n3. Downloading & parsing GPX files (10 concurrent)…");
  type Parsed = {
    name: string;
    description: string;
    format: "gpx";
    author: string;
    geojson: { type: string; features: unknown[] };
  };
  const parsed: Parsed[] = [];
  const parseFailed: string[] = [];
  const DOWNLOAD_CONCURRENCY = 10;
  let doneCount = 0;

  for (let i = 0; i < newTracks.length; i += DOWNLOAD_CONCURRENCY) {
    const chunk = newTracks.slice(i, i + DOWNLOAD_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (item) => {
        const fc = await downloadAndParseGpx(item);
        doneCount++;
        if (doneCount % 50 === 0 || doneCount === newTracks.length) {
          process.stdout.write(`   Parsed ${doneCount}/${newTracks.length}…\n`);
        }
        return { item, fc };
      }),
    );
    for (const { item, fc } of results) {
      if (!fc) {
        parseFailed.push(item.name);
      } else {
        parsed.push({
          name: item.name,
          description: buildDescription(item),
          format: "gpx",
          author: AUTHOR,
          geojson: fc,
        });
      }
    }
  }

  if (isDryRun) {
    console.log(`\nDry run — would upload ${parsed.length} track(s). Exiting.`);
    return;
  }

  if (!parsed.length) {
    console.log("\nNo tracks to upload after parsing.");
  } else {
    console.log(`\n4. Uploading ${parsed.length} track(s) in batches of ${BATCH_SIZE}…`);
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
      const batch = parsed.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(parsed.length / BATCH_SIZE);
      process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${batch.length} tracks)… `);
      try {
        const res = await fetch(BULK_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ datasets: batch }),
        });
        if (!res.ok) {
          const err = await res.text();
          process.stdout.write(`ERROR ${res.status}: ${err.slice(0, 80)}\n`);
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

    console.log("\n" + "=".repeat(50));
    console.log(`Results:`);
    console.log(`  Imported:      ${succeeded}`);
    if (failed > 0) console.log(`  Upload failed: ${failed}`);
    if (parseFailed.length > 0) console.log(`  Parse skipped: ${parseFailed.length}`);
    console.log(`  Already had:   ${skipCount}`);
    console.log(`  Total:         ${allTracks.length}`);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
