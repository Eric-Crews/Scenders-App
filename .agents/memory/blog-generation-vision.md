---
name: AI blog post generation from tracks
description: How the "Create blog post" feature turns a published track + photos into a web blog post via gpt-4o vision.
---

# AI blog generation from tracks

A published community track can be turned into a third-person blog post on the
mapper.one web app via gpt-4o, using **the app owner's own `OPENAI_API_KEY`**
env secret (single-tenant — there is no per-end-user key, despite the phrase
"user's own key"). Photos attached to the track's waypoints are uploaded to
object storage (public `/storage/objects/*`) and fed to gpt-4o as vision input.

**Vision photo URLs must be publicly fetchable by OpenAI's servers.**
**Why:** OpenAI downloads `image_url` values server-side; an unreachable or
blocked URL (e.g. Wikimedia thumbnails reject non-browser fetchers) throws
`400 invalid_image_url` and fails the *entire* completion, not just that image.
**How to apply:** always wrap the vision generation in a text-only fallback —
if the call throws and photos were attached, retry once with no images so a
single bad photo never kills the post. Our own `/storage/objects/*` URLs are
fine; arbitrary external URLs are not guaranteed.

**No auth on generation/upload endpoints — by design, not an oversight.** The
whole app is unauthenticated (community datasets too), so the blog generate +
presigned-upload endpoints follow suit. Revisit only if/when app-wide auth is
added; flag the OpenAI cost-abuse surface then.

**Waypoint field notes are the AI's grounding + published photo captions.**
`imageCaptions` (photo notes) is sent **index-aligned with `imageUrls`** — the
mobile uploader only pushes a caption when its photo upload succeeds, so a
skipped upload never shifts captions. The server re-normalizes captions to
`imageUrls.length` before using/storing them, so a malformed caller can't
mis-caption. No-photo waypoint notes ride along as `fieldNotes` (AI context
only — not stored, not displayed). All of this still flows **only** through the
explicit "Create blog post" action, never on record/publish.
**How to apply:** any change to the photo-upload loop or the caption/url arrays
must keep the two arrays index-aligned, or web captions and vision pairing drift.
