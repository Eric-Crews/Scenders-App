// Canonical public web URL for Scenders.
//
// User-facing links that open the web app in a browser (blog posts, the
// donation thank-you page, etc.) use this branded domain rather than the
// per-environment Replit URL, so what the user sees and shares is always
// Scenders. Note: API and auth calls still use EXPO_PUBLIC_DOMAIN (see
// lib/community.ts, lib/sync.ts, lib/auth.tsx) — those are backend requests,
// not links a user opens, and must hit the current environment's server.
//
// Defaults to production. Set EXPO_PUBLIC_WEB_BASE_URL in dev/staging if you
// want "Open on web" links to resolve against a non-production site (e.g. so a
// freshly published blog slug that only exists in staging opens there).
export const WEB_BASE_URL =
  process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim() || "https://scenders.com";
