---
name: Supportal trail sync
description: How the community library imports trails from the upstream Supportal catalog (status count + server-side sync).
---

# Supportal trail sync

Server-side import of GPX trails from the upstream Supportal catalog into the community library. Mobile shows a "new trails available" count; a maintainer taps to import.

- **Prod DB can diverge from dev DB on region population.** The old sync-script import path (pre-region-computation) left 1,428 prod rows with `region IS NULL` even though dev DB was fully populated. `POST /api/community/datasets/backfill-regions` is the fix — it's idempotent and safe to re-run. Updated 1,426 prod rows in one call.
- **Dedup is by description marker, not a DB column.** Imported datasets carry a `[supportal:<id>]` tag in their description; "imported" = upstream IDs whose marker already exists in the DB. `newCount = available − imported`.
  - **Why:** avoided a schema migration. **Consequence:** no DB uniqueness on the Supportal ID, so concurrent syncs on *different* process instances can double-import. The in-flight lock + TTL cache are process-global only. If multi-instance duplicates ever appear, add a unique source-id column instead of relying on the marker.
- **Parse/insert failures stay "new" and retry on the next tap** — items are only deduped once their marker is successfully inserted. `remaining = newItems − imported` per sync. Each sync is capped (CAP 50) with bounded concurrency.
- **GPX download is https-only** (`new URL(item.url).protocol === "https:"`) to block SSRF if the upstream catalog is poisoned. Hosts are *not* allowlisted because the GPX bucket (S3) can change.
- **Auth:** the sync endpoint is intentionally unauthed, matching every other community write route (bulk/single insert). "Maintainer taps" is UX framing, not an enforced role — there is no maintainer-role system to hook into.
- **esbuild bundling:** `@mapbox/togeojson` + `@xmldom/xmldom` are imported statically (with an ambient `togeojson.d.ts`) so esbuild bundles them into the prod build; `createRequire` would not bundle.
- **Public attribution:** never expose Supportal, VentureOut, Adventure Collective, or the internal import marker on customer-facing community-map or enhanced-trail surfaces; label those records “Community map” instead. **Why:** the upstream catalog is only a transport for community maps and must not be correlated with user-published maps. **How to apply:** preserve the marker only for server-side deduplication, and sanitize metadata before public API responses, AI prompts, stored guide copy, and rendered trail pages.
