---
name: Datasets follow as synthetic tracks
description: How imported/community datasets (routes) reuse track follow-mode on the map screen.
---

Community/imported datasets are routes, so they reuse the existing track follow
infrastructure instead of a parallel system.

- Tapping a dataset feature in Leaflet bridges to RN via a `datasetTap` WebView
  message (carrying the dataset id), guarded so it does not fire during plot mode.
- The dataset's LineString/MultiLineString coords are flattened into TrackPoints
  (3rd GeoJSON position is altitude when present); elevation is backfilled from the
  elevation proxy only when online and the route lacks embedded altitude.
- "Follow" builds an in-memory synthetic `Track` with id `dataset:<datasetId>` and
  sets it directly as `followTrack`.

**Why:** Setting the synthetic track directly (not via `addTrack` or the
`?follow=` param path, which look tracks up by id in the persisted `tracks` array)
keeps it out of AsyncStorage and cloud sync — it is a transient view target, not a
saved track. All follow memos key off `followTrack.points`, so the synthetic track
drives the existing panel (remaining, off-route, elevation) and background follow.

**How to apply:** When adding follow-like behavior for any non-track geometry,
prefer synthesizing a `Track` and setting `followTrack` directly; do not persist it.
Sequence async elevation backfills with a monotonic request token so overlapping
taps can't flip loading/points state for a stale request.
