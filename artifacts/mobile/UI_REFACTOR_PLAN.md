# Scenders Ride UI modernization plan

## Product direction

Scenders Ride should feel like a focused trail utility: fast to read at the
trailhead, calm while moving, and unmistakably Scenders. The visual system is
black and charcoal with restrained orange emphasis, compact typography, flat
sections, clear dividers, route imagery, and limited corner radii.

The refactor must preserve the six core jobs already supported by the app:

1. Find and follow GPX tracks.
2. Record a ride and share live progress through a private link.
3. Add photo or note waypoints and retain them with completed rides.
4. Build a route from proposed points before a ride.
5. Save map areas for offline use.
6. Browse and save community-added GPX tracks.

## Information architecture

The primary tabs are **Home**, **Explore**, **Record**, **Rides**, and **Saved**.

- **Home** is the daily launch surface: featured/nearby riding, active ride,
  primary actions, offline readiness, recent rides, and first-run orientation.
- **Explore** contains curated Scenders ride guides. Its supported filters stay
  limited to difficulty, rating, and distance.
- **Record** owns the map and its recording, following, route-building,
  waypoint, layer, and offline-download modes.
- **Rides** contains recorded and planned routes plus sharing and publishing.
- **Saved** contains imported, curated, and community GPX datasets plus offline
  regions.
- Waypoints, account, support, and settings remain secondary destinations
  reachable from Home or contextual actions.

## Migration phases

### Phase 1 — Home and navigation

- [x] Separate the launch screen from the full map.
- [x] Add shared Scenders design tokens and brand chrome.
- [x] Add a consistent five-tab navigation bar with Record centered.
- [x] Wire Start ride, Build route, Offline maps, recent rides, and ride-guide
      actions into existing workflows.
- [x] Add a dismissible first-run product primer without blocking daily use.

### Phase 2 — Explore and ride details

- Replace the large marketing-style Explore header with a compact location and
  search header.
- Move difficulty, rating, and distance into a concise filter tray.
- Standardize route rows, media treatment, metadata, loading, and empty states.
- Refactor ride detail around route image/map, essential stats, Follow, Save,
  and trailhead information while retaining source and shop links.

### Phase 3 — Record map

- Keep the map renderer, GPS recording, route following, plotting, offline tile
  system, live sharing, and waypoint code intact.
- Replace scattered floating controls with a consistent top status bar and
  bottom action dock.
- Give recording, following, route building, and offline download visibly
  distinct modes and one clear primary action each.
- Consolidate current sheets using shared dark sheet, field, button, and status
  components.

### Phase 4 — Rides and Saved

- Use a shared route-row system for recorded rides, planned routes, and saved
  GPX files.
- Add compact segmented filters rather than separate visual languages.
- Prioritize Resume/Follow, Share, Edit, and Offline actions; move destructive
  and publishing actions into an overflow menu.
- Surface live-link state and waypoints on the completed-ride detail surface.

### Phase 5 — Secondary surfaces

- Migrate Waypoints, More, authentication, discussions, donations, private
  projects, share-link screens, alerts, and empty/error states to the shared
  Scenders system.
- Replace remaining Mapper One copy and legacy domains where Scenders-owned
  destinations exist.
- Apply a consistent status-bar, safe-area, keyboard, accessibility, and
  reduced-motion policy.

## Functional guardrails

- UI work must not replace or fork the existing maps, recording, sync, offline,
  parsing, elevation, or live-sharing data layers.
- Route transitions must preserve `follow`, `edit`, `dataset`,
  `followDataset`, and community-guide parameters.
- Recording continues when navigating away from the map; Home must show a
  Resume ride state whenever a recording is active.
- Home requests foreground location access so it can feature the highest-rated
  ride within 20 miles. A last-known fix renders quickly while a current fix is
  acquired; denied or unavailable location falls back to top-rated library
  rides without blocking the rest of Home.
- Offline state is derived from saved regions and tile counts, never inferred
  from network state alone.
- Explore filters may use only real fields supplied by ride-guide data:
  difficulty, rating, and distance.

## Release gates

Before each migration phase ships:

- TypeScript and Expo web export pass.
- Start/stop recording, background recording, and save-track flows pass on a
  physical device.
- Follow saved track and follow downloaded ride-guide flows pass.
- Plot, edit, undo, save, and resume planned routes pass.
- Create/revoke live link and offline queue recovery pass.
- Add text/photo waypoint during a recording and reopen it from the completed
  ride pass.
- Download an offline region, disable connectivity, reopen the app, and render
  cached tiles pass.
- Import, save, and follow a community GPX track pass.
- VoiceOver/TalkBack labels, text scaling, contrast, and 44-point touch targets
  pass on the changed surfaces.
