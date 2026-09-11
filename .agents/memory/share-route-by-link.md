---
name: Share route by link (public/private)
description: How track share-links work end to end and the invariants that keep public links honest.
---

# Share a track by link

A track gets a `shareToken` (server-minted `crypto.randomBytes(9).base64url`), a
`shareVisibility` ('private'|'public'), and `sharedAt`. The link opens a server-
rendered Leaflet page at `/r/:token` (api-server, root-mounted) AND deep-links the
app via `mobile://share/<token>` (app scheme is "mobile").

- **Read endpoint is unauthed** (`GET /api/shared/tracks/:token`) — anyone with the
  token reads name/description/color/kind/stats/points. Treat the token as the only
  secret; never leak owner identity in the payload.
- **`/r/:token` renders user-controlled data** — escape title/description/links
  (`escapeHtml`), inline coords as numeric JSON arrays, allowlist color
  (`^#[0-9a-fA-F]{3,8}$`). Private → `noindex,nofollow`; public → `index,follow`.

**Why (public invariant):** a public link must *also* exist in the community library.
So the mobile `doShare('public')` publishes to community **first** (guarded by
`publishedDatasetId` to avoid double-publish); only if that succeeds does it call
`shareTrack` to mark the link public. Never mark a link public before its community
entry exists — a failed publish must abort, not leave an orphan indexable link.

**How to apply:** if you touch the share flow, keep publish-before-publicize ordering
and the `publishedDatasetId` dedup guard. `pushTrack` deliberately omits share fields,
so a normal track sync won't clobber/leak the token.

## Browser map privacy

Private capability links can render a browser map for recipients, but must use a local
neutral background rather than requesting third-party map tiles.

**Why:** tile requests disclose the viewed geography (and can disclose the capability
URL through referrers) to the provider, which defeats the privacy expectation of a
token-only project link even when the page is `noindex` and `no-store`.

**How to apply:** public community pages may load public basemap tiles and receive
indexable route-preview metadata; private pages must remain `noindex,nofollow`,
`private, no-store`, use a restrictive referrer policy, and keep map/route content out
of metadata and social previews.
