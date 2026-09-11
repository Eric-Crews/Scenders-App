---
name: Download all routes by region
description: How community routes are grouped by region (US states + countries) and bulk-imported offline.
---

# Download all routes by region

Lets users browse the community library grouped by region and bulk-import every route in a region into the offline library.

## Region tagging
- `@workspace/geo` (`lib/geo`) owns `regionForPoint(lat,lng)` (ray-cast point-in-polygon, **states checked before countries**) and `regionKind`. Boundaries live in `lib/geo/src/regions.json` (~343KB), loaded via `new URL("./regions.json", import.meta.url)` — NOT a JSON import (no declaration emit).
- Region is computed **server-side from the bounds centroid** on POST + bulk insert and stored in the `region` text column on `community_datasets`. It is never trusted from the client.
- **Bundling gotcha:** api-server is esbuild-bundled to `dist/`. Because geo reads `regions.json` relative to `import.meta.url`, `artifacts/api-server/build.mjs` has an explicit copy step putting `regions.json` next to `dist/index.mjs`. If you change geo's asset path or the build output dir, update that copy step or the endpoint 500s at runtime.

## Endpoints / contract
- `GET /community/regions` → `CommunityRegionSummary[]` (region, kind, datasetCount, totalSizeBytes, totalDistanceMeters|null). Distance/size are summed DB columns — does not read geojson.
- List endpoint gained optional `region` query param; **list cap is 200 default but raised to 5000 when a region filter is present** so a full region drilldown returns everything.

## Mobile (library.tsx)
- `browseMode` toggle ("near" / "region"). Region view: region cards → drilldown → "Download all" (sequential import, skips already-downloaded by `communityId`, progress + Alert).
- **Race guard:** region drilldown fetches use a `regionReqSeq` ref (same pattern as `communityReqSeq` for the near-you list). Without it, rapid region switching (open A → back → open B) lets A's late response overwrite B's list. `closeRegion` bumps the seq to cancel in-flight fetches.

## Backfill
- `scripts/src/backfill-community-regions.ts` (npm: `backfill-community-regions`) tags existing NULL-region rows from bounds centroid. Run on dev DB. **Prod backfill is a separate post-merge/follow-up step.**
