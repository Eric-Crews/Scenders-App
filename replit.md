# mapper.one

Open-sourced and open for collaboration map software for the wild places. Mobile-first Avenza Maps replacement, part of [The Adventure Collective](https://advcollective.com) (contact: info@advcollective.com), with a "standing on the shoulders of giants" philosophy — built on OpenStreetMap, Leaflet, and the open-data community that came before. Note: not MIT-licensed; license terms TBD by the collective.

Users import map datasets (KML, KMZ, GeoJSON, GPX), view them on Leaflet maps with offline tile capability, drop GPS waypoints, and manage a maps library — all from their phone.

## Run & Operate

- `pnpm --filter @workspace/mobile run dev` — run the Expo app (mobile artifact)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, currently unused by the mobile app)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo (React Native) + expo-router, Leaflet 1.9.4 in a WebView
- State: React context + AsyncStorage persistence
- Map parsing: `@mapbox/togeojson` + `xmldom` (KML/GPX), `jszip` (KMZ)
- Offline tiles: OSM tiles cached via `expo-file-system` to durable document storage
- Photos: `expo-image-picker` (camera + library), saved to `documentDirectory + "photos/"`

## Where things live

- `artifacts/mobile/` — the Expo app (mapper.one)
  - `app/(tabs)/` — Map / Library / Waypoints / About tab screens
  - `components/MapView.tsx` — WebView + Leaflet bridge
  - `lib/leafletHtml.ts` — generates inline Leaflet HTML; assets at `assets/leaflet/bundle.json`
  - `lib/tiles.ts` — OSM tile download/cache + offline manifest
  - `lib/parsers.ts` — GeoJSON / KML / KMZ / GPX parsing
  - `contexts/MapsContext.tsx` — datasets, waypoints, regions, AsyncStorage persistence

## Architecture decisions

- Leaflet runs inside a `react-native-webview` rather than a native map SDK, so the same renderer ships on iOS and Android with full offline tile control.
- `leaflet.css` and `leaflet.js` are pre-bundled into a single JSON asset (`assets/leaflet/bundle.json`) because Metro doesn't treat raw `.css`/`.js` as importable assets.
- Offline tiles live under `FileSystem.documentDirectory + "tiles/"` (durable, not OS-evictable) so saved regions survive cache pressure.
- A custom `L.TileLayer` checks an injected base64 manifest first and falls back to OSM only when "Online" is enabled, allowing true field-offline use.
- Web platform is best-effort only — `react-native-webview` is unsupported in the browser, so the Leaflet map only renders on real devices via Expo Go.

## Brand & voice

- Name: **mapper.one** (lowercase, with the dot)
- Tagline: "Open-source community map software for the wild places."
- Tile User-Agent: `mapper.one/1.0 (+https://mapper.one)`
- Tone: community-first, grateful to the giants whose shoulders we stand on (OSM, Leaflet, surveyors, trailblazers).

## User preferences

_Populate as you build._

## Gotchas

- Don't import raw `.css`/`.js` from `assets/` — Metro can't resolve them as static assets. Re-run `node -e "..." > bundle.json` if you ever update Leaflet.
- `expo-file-system/legacy` APIs (`getInfoAsync`, `downloadAsync`, etc.) throw on web — every call site in `lib/tiles.ts` and `lib/photos.ts` is guarded with `Platform.OS === "web"`.
- Don't put offline tiles or photos in `cacheDirectory`; they get evicted. Both live under `documentDirectory`.
- Waypoint `photoUri` is **device-local only**. `pushWaypoint`/`pullWaypoints` deliberately strip it; on cloud-pull, `MapsContext.preserveLocalWaypointFields` re-grafts the local `photoUri` onto the authoritative cloud row by id so photos don't disappear after a sync.
- The active recording's track id is pre-allocated at `recording.start()` so POIs dropped mid-recording can reference the eventual track. `RecordingContext` mirrors it in a ref because `stop()` is memoized and would otherwise close over a stale value.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `artifacts` skill for artifact lifecycle (`createArtifact`, `presentArtifact`, etc.)
