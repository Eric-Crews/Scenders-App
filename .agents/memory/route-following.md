---
name: Route plotting & following conventions
description: Non-obvious decisions for plotted tracks, the follow-via-param flow, and the elevation proxy
---

# Plotted vs recorded tracks

- Tracks carry `kind?: "recorded" | "plotted"` (legacy/undefined ⇒ "recorded"). The field flows through types → openapi (TrackSummary + TrackInput) → db (`tracks.kind` varchar default 'recorded') → server me.ts → sync.ts mappers/push body. Any new track-shape field must be threaded through all of these in lockstep or sync/push silently drops it.
- Plotted tracks are saved with `durationMs: 0` and synthetic sequential `t` values (`now + i`); `startedAt === endedAt === createdAt`. UI must therefore hide duration for plotted tracks (it is meaningless).

# Re-editing a saved route
- A saved route is re-opened into plot-edit mode via `?edit=<trackId>` (mirrors the `?follow=` flow: wait for `tracks` to hydrate, clear the param only after found). Plot state (`plotPoints`/`plotElevations`/`plotName`) is seeded from the track; an `editTrackId` flag switches Save from `addTrack` (new) to `updateTrack` (in place) so editing never duplicates.
- `MapsContext.updateTrack` MUST sync (recordDirty + pushTrack) like addTrack — it was local-only originally and silently never reached the cloud. pushTrack is a PUT (upsert), so the same call updates.
- The plot elevation-fetch effect must NOT wipe `plotElevations` on the offline branch, otherwise editing a saved route offline and saving zeroes out its altitudes. New plots are unaffected (their array is already empty).

# Editing a route while plotting
- Plot vertices are draggable Leaflet markers; the route line is kept glued live in the webview during a drag (`syncPlotPolyline`), but the authoritative move is only posted to RN on `dragend` (one state update, not per-frame) to avoid flooding the bridge.
- A Leaflet marker `click` does not bubble to the map `click`, so tapping a vertex/midpoint never adds a stray point. A drag also fires a trailing `click`; guard it with a `moved` flag so a drag isn't misread as a tap-to-select.
- Midpoint "+" handles sit at each segment midpoint; tapping posts `plotInsert{index}` meaning splice at `index+1`. Any insert/undo/clear must reset the selected-vertex index (indices shift).
- `renderPlot(points, selectedIndex)` is the single source of truth — selection highlight is driven from RN state, not toggled inside the webview.

# Follow-via-query-param flow
- Following is triggered from the Tracks list by navigating to the map with `?follow=<trackId>`; the map screen consumes it in an effect keyed on `[params.follow, tracks]`.
- **Why the param must clear only after the track is found:** on cold start / deep link, `tracks` may not be hydrated yet. Clearing the param unconditionally permanently drops the request and follow never starts. Pattern: `if (!target) return;` (let the effect re-run when tracks hydrate), and only call `router.setParams({ follow: undefined })` after a found/definitively-unusable track.
- Follow mode hides the global bottom GPS controls, so the follow panel itself must expose a GPS enable/toggle button — otherwise a user whose tracking auto-enable failed (permission denied) cannot recover without leaving follow.
- Off-route threshold is user-adjustable (`settings.offRouteThreshold`, presets `OFF_ROUTE_THRESHOLD_PRESETS` = 25/50/100 m, default 50). Drives banner + destructive-colored distance + alert trigger. Recovery uses a `BACK_ON_RATIO` (0.7) of the chosen threshold for hysteresis (replaces the old fixed 35 m).
- Off-route haptic/voice alerts fire once *per crossing*, not per GPS tick: a `wasOffRouteRef` mirrors the physical state and is updated regardless of the user toggle (so flipping alerts mid-trip never double-fires). Use hysteresis — trip at >50 m, announce recovery only under a tighter band (35 m) — to avoid buzzing while hovering on the boundary. Voice uses `expo-speech`; haptics are native-only, speech is best-effort all-platforms.
- Device-local preferences (e.g. off-route alert toggles) live in `MapsContext` `settings` under `KEY_SETTINGS`, persisted like `layers` but **never synced** to the cloud. Parse each field defensively against `DEFAULT_SETTINGS` on load.

# Background off-route alerts (phone pocketed/locked)
- Foreground React effect freezes when backgrounded, so alerting is split: foreground effect owns it while `AppState.currentState === "active"`; a `TaskManager` background-location task (`lib/backgroundFollow.ts`) owns it otherwise. Both gate on AppState so a single crossing never double-fires.
- The background task can't read React state. The screen mirrors the active follow config (route points, threshold, alerts/voice toggles) into AsyncStorage; the off-route latch (`wasOffRoute`, with the same `BACK_ON_RATIO` hysteresis) is a *shared* persisted key both paths read/write. On return to foreground, re-sync the in-memory ref from the persisted latch.
- Background updates only start while `followTrack && tracking && offRouteAlerts` (battery). `startLocationUpdatesAsync` needs a foregroundService block (Android) + iOS `UIBackgroundModes:["location"]` + Always permission + the expo-location plugin `isAndroid/IosBackgroundLocationEnabled` flags. It throws in Expo Go — wrap in try/catch and degrade to foreground-only alerts.
- `TaskManager.defineTask` must run at module scope; guard it (and all background calls) with `Platform.OS !== "web"` since expo-task-manager isn't supported on web.

# Live position on the elevation profile (follow mode)
- `ElevationProfile` takes a `markerDist` prop (cumulative meters from route start) for a fixed "you are here" marker, distinct from the drag `scrub` marker. Drawn in `colors.accent`; scrub is drawn after so it sits on top.
- Compute `markerDist` as `pathLengthMeters(route) − routeProgress.distanceRemainingMeters` — this stays on the chart's x↔distance scale because both use cumulative haversine over the *same* point list. Clamp to `[0, geom.maxDist]` so a position past the last altitude-bearing point pins to the chart end.

# Elevation profile scrubbing
- `ElevationProfile` samples store lat/lng alongside dist/alt so a finger drag can interpolate an on-route point and report it via `onScrub`. The chart's x↔distance maps over *all* points (cumulative haversine) but only altitude-bearing points become samples; straight-line interpolation between consecutive samples is exact when every point has alt (the common case after the elevation proxy fills them in).
- The map highlight is a non-interactive Leaflet `circleMarker` driven by `MapView.setElevationMarker(loc|null)` → webview `FM.setElevationMarker`. Only wired where a map is on-screen (plot save sheet); the Tracks tab has no map, so its chart shows the callout/indicator only. Always clear the marker when the host sheet closes (effect keyed on the sheet's open flag), since `onPanResponderRelease` only fires if the finger actually lifts over the chart.

# Next-climb highlight (follow mode)
- `nextClimb(points, markerDist)` (lib/elevation.ts) picks the first significant ascent whose *summit* is still ahead of the marker, returning the whole base→summit route polyline. Detection merges shallow saddles (drop tolerance) so one long climb broken by a dip isn't split; thresholds are fixed constants (min gain / drop tolerance), not yet user-tunable.
- The highlight rides the same imperative WebView bridge as the elevation scrub marker: `MapView.setClimbHighlight(path|null)` → `FM.setClimbHighlight`. Because it follows the *whole* climb (stable until crested), gate re-injection on a start:end distance key so per-GPS-tick recomputes don't re-inject an identical line.
- Climb color `#d6453d` is duplicated: hardcoded in leafletHtml's `setClimbHighlight` AND `colors.climb` (used by ElevationProfile's `highlightRange` band). Keep them in lockstep so the map line and profile band read as the same stretch.

# Elevation proxy
- `POST /api/elevation` (server route, no auth) proxies Open-Meteo `api.open-meteo.com/v1/elevation`, UA `mapper.one/1.0 (+https://mapper.one)`. It caps input at 100 points and returns one elevation (or null) per point; on any upstream/network failure it returns all-nulls so the client degrades gracefully offline.
- The mobile `fetchElevations` helper chunks requests at 100 points to respect that cap, and returns all-null on failure. Elevation is fetched debounced (500ms) and only when Online is enabled.
