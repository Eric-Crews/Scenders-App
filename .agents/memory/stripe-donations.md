---
name: Stripe donations (pay-what-you-want)
description: Non-obvious constraints when wiring Stripe Checkout donations through the OpenAPI-first stack.
---

# Stripe pay-what-you-want donations

Fire-and-forget one-time donations via Stripe Checkout (web + mobile), no DB persistence.

- **Pay-what-you-want uses `price_data`, not a Price ID.** The skill's "use price IDs" rule is for fixed catalogs. For an arbitrary per-donor amount, `line_items[].price_data` with a custom `unit_amount` (cents) is correct. `mode: "payment"`, `submit_type: "donate"`.
  **Why:** there is no fixed catalog price to reference; the amount is chosen per request.

- **orval does NOT emit `.int()` from OpenAPI `type: integer`.** Generated zod is `zod.number().min().max()` only, so non-integer values pass validation and only fail downstream at Stripe (surfacing as a 503). Enforce `Number.isInteger(...)` server-side and return 400.
  **How to apply:** any integer-bounded body field that must be a whole number needs an explicit runtime integer guard in the route — don't trust the generated schema alone.

- **Stripe SDK pins `apiVersion` in its TypeScript types.** The integration snippet's version string can be stale vs the installed SDK and fails typecheck (TS2322). Use the version the installed types demand.
  **How to apply:** if `apiVersion` errors on typecheck, read the expected literal from the error and match it.

- **Build success/cancel URLs server-side, never from client input** (avoids open-redirect). They point at the canonical public site `https://mapper.one` (overridable via `PUBLIC_SITE_URL`), so donors always land on the branded `/support?status=success|cancelled` page rather than the per-environment Replit URL. (Earlier this was derived from `REPLIT_DOMAINS` with a 503 fail-fast; that was replaced because user-facing return links should use the branded domain.)
  **Why:** the user asked that app→web links use mapper.one, not the Replit URL; the public domain is stable across environments. Mobile mirrors this with `WEB_BASE_URL` (`artifacts/mobile/constants/site.ts`, overridable via `EXPO_PUBLIC_WEB_BASE_URL`), while API/auth calls still use the per-env `EXPO_PUBLIC_DOMAIN`.

- **Stripe client lives in `artifacts/api-server/src/lib/stripeClient.ts`** as `getUncachableStripeClient()` (fetches fresh connector creds each call — never cache). `stripe-replit-sync` was intentionally skipped: no DB persistence needed for fire-and-forget donations.
