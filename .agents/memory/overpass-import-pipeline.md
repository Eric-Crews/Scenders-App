---
name: Overpass import pipeline
description: How OSM trail/road data is imported from Overpass API into community_datasets; key gotchas for cloud IP blocking and data volume.
---

## Rules

**Overpass API requires two headers or gets 406:**
- `Accept: application/json`
- `User-Agent: mapper.one/1.0 (+https://mapper.one)`
Without these, overpass-api.de returns HTTP 406 from cloud IPs.

**Full-state bbox queries exceed 50MB → empty result:**
- NC has 48k+ track ways; full-state query hits Overpass's maxsize limit silently
  (returns `{elements: [], remark: "..."}` with HTTP 200).
- Fix: tile each state bbox into 1°×1° grid cells (makeGrid), query each cell,
  deduplicate by OSM way ID across cells, merge into one dataset.

**GeoJSON payload size:**
- Strip null properties (name/highway/surface only, no _osmId or tracktype)
- Round coordinates to 5 decimal places (~1m accuracy)
- OVERPASS_MAX_BYTES = 50MB (was 20MB)

## Architecture

- `importOverpassForState(state, kind)` — grids the bbox, fetches each cell,
  deduplicates, converts to GeoJSON, deletes old dataset, inserts new one.
- Markers: `[overpass:StateName]` (road) and `[overpass-trail:StateName]` (trail)
  embedded in description — used to detect existing data and to dedup on re-import.
- `stateImportsInFlight: Set<string>` — prevents concurrent per-state imports.
- `overpassSyncInFlight: boolean` — global flag for sync-all bulk job.
- `POST /community/overpass/sync-state` — fire-and-forget (returns immediately);
  mobile polls `GET /community/overpass/sync-state/status?state=X` every 30s.

**Why:** The community datasets table stores one row per state per kind. The mobile
"Get data" banner in the region drilldown triggers a user-initiated import that
populates data for all users once — not just the requesting user.
