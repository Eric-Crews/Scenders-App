---
name: Mobile app data backend selection
description: How the Expo app chooses which API/database serves tracks/datasets, and why bundle host != data host
---

The Expo mobile app has **two independent "where does it point" knobs**, and conflating
them causes "why is my data missing / two versions of the app" confusion:

1. **Bundle delivery (the app's code):** `EXPO_PACKAGER_PROXY_URL` /
   `REACT_NATIVE_PACKAGER_HOSTNAME` = the dev Metro server (`*.expo.<cluster>.replit.dev`).
   Expo Go always loads JS from here. There is no "production app URL" until native /
   EAS builds exist.
2. **Data backend (tracks, datasets, waypoints, auth, tiles, elevation, community):**
   `EXPO_PUBLIC_DOMAIN`. All of `lib/sync.ts`, `lib/community.ts`, `lib/elevation.ts`,
   `lib/auth.tsx` build `https://${EXPO_PUBLIC_DOMAIN}/api`. `EXPO_PUBLIC_*` vars are
   inlined into the bundle at build time, so changing it requires a Metro restart + app
   reload.

Dev and prod are **separate Postgres databases**. By default the dev workflow set
`EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN` → dev API → dev DB (often empty), while the
user's real data lived on production (`mapper.one`).

**Decision:** the mobile `dev` script in `artifacts/mobile/package.json` sets
`EXPO_PUBLIC_DOMAIN=mapper.one` so the dev Expo app reads/writes the **production**
backend.
**Why:** the user wanted their existing prod tracks/datasets to load in Expo Go.
**How to apply / caveats:** this means dev testing mutates **live prod data** — there is
no longer dev/prod data isolation for mobile. After switching, the SecureStore session
token from the old backend is invalid, so the app will require a fresh login before prod
data appears. Production API is live at `https://mapper.one` (`/api`), also
`mapper-one.replit.app`.
