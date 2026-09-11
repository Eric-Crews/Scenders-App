---
name: Community dataset distance/elevation stats
description: How distance + elevation gain are derived for community datasets and the per-part rule that keeps them correct
---

The site shows a derived "distance · climb" summary in place of a missing author
description for community datasets. `distanceMeters` and `elevationGainMeters` are
**persisted DB columns** computed once at insert (exposed as nullable fields on
`CommunityDatasetSummary`). The list endpoint selects only summary columns and
**never reads `geojson`**, so listing stays cheap regardless of dataset size.

**List is location-aware (nearest-N):** GET `/community/datasets` accepts optional
`lat`/`lng`, `q` (ILIKE over name/description/author), and `limit` (default 50, max
200). With `lat`+`lng` it ranks by the bounding-box centroid using a cheap planar
metric (lng scaled by cos(lat)) ordered `ASC NULLS LAST`; otherwise newest-first.
**Why:** loading the whole library to the device got slow as it grew.
**How to apply:** the client must refetch on origin/search change (server owns
filtering + ordering — do NOT re-filter/re-sort locally) and guard against
out-of-order responses with a request-sequence token. zod `coerce.number()` does
not enforce integer, so floor `limit` before passing it to SQL `LIMIT`.

**Per-part summation rule (critical):** distance/elevation must be summed *within each
independent line part* — each LineString, and each member of a MultiLineString — and
never across part or feature boundaries. Flattening every coordinate into one array and
summing pairwise adds phantom "bridge" segments between disconnected features, which can
inflate a small route to thousands of km.
**Why:** community datasets are often multi-feature / multi-segment; the bug is silent
(no error, just a wildly wrong number).

**Null semantics:** `distanceMeters` is null only when there is no line geometry at all
(a real zero-length route reports 0); `elevationGainMeters` is null when no coordinate
pair carries altitude. Point/polygon-only datasets keep the plain "No description" text.

Note: the mobile `lib/datasetRoute.ts` deliberately *does* flatten all parts into one
followable track — that's fine for follow-mode, but do not reuse that flattening for
distance stats.
