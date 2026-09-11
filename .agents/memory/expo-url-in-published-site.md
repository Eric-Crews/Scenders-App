---
name: Expo Go dev URL in the published marketing site
description: How the site's "Get the App" QR gets its Expo URL, and why the dynamic API approach replaced the baked-at-build-time approach
---

## Current approach (dynamic)

`GET /api/app-config` on the api-server reads `process.env.REPLIT_EXPO_DEV_DOMAIN` at
request time and returns `{ expoUrl: "exp://..." | null }`. The site fetches this via
`useGetAppConfig()` (generated React Query hook) and renders the QR from the live value.
`null` is returned when no Expo dev server is running (production fallback → placeholder text).

**Why dynamic instead of baked at build time:** the Expo dev domain (`REPLIT_EXPO_DEV_DOMAIN`)
rotates between dev sessions. A statically-baked URL (old `VITE_EXPO_DEV_DOMAIN` approach)
goes stale without a redeploy and shows a wrong URL in Expo Go.

**Production note:** `REPLIT_EXPO_DEV_DOMAIN` may or may not be set in the autoscale
production environment (Replit injects it for the Expo artifact workflow). If absent,
`/api/app-config` returns `{ expoUrl: null }` and the site shows "coming soon" text — which
is correct (production visitors can't use a dev Metro URL anyway).

## What was removed

- `VITE_EXPO_DEV_DOMAIN` bake-in block in `vite.config.ts` (no longer needed).
- `SITE_EXPO_DEV_DOMAIN` production env var (was a stopgap; still set in `.replit` but unused).
- Module-level `EXPO_DEV_DOMAIN` / `EXPO_GO_URL` consts in `Home.tsx`.

## Expo Go loading failures that are NOT a URL problem

If Metro serves a valid manifest (curl the Expo domain with `expo-platform: ios` → 200 +
`runtimeVersion: exposdk:NN`) but Expo Go on-device still fails, it's a client-side
SDK version mismatch — confirm with `expo install --check`.
