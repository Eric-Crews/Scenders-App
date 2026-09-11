---
name: SEO / SSR landing pages
description: How and why mapper.one's crawlable marketing/SEO pages are served, not by the SPA.
---

# Crawlable SEO pages must be server-rendered by the api-server, not the SPA

The marketing site (`artifacts/site`) is a client-only Vite SPA, so its routes are
effectively invisible to search-engine crawlers that don't run JS. Any page that
needs to rank (comparison/"alternative" pages, roundups, etc.) is rendered to a
complete HTML string by the **Express api-server** and routed to it by the shared
reverse proxy.

**How to apply:**
- Put generators under `artifacts/api-server/src/seo/` (a shared HTML shell +
  content modules) and a router mounted at app **root** (before `/api`), not under `/api`.
- The proxy only forwards paths listed in the api-server's `artifact.toml`
  `services.paths`. Add each new top-level SEO path (e.g. `/compare`,
  `/sitemap.xml`, `/robots.txt`) there via `verifyAndReplaceArtifactToml`, or the
  proxy hands the request to the SPA instead. Most-specific-path-wins, so a
  specific SEO path beats the SPA's `/`.
- Verify crawlability with `curl localhost:80/<path>` and grep the keyword out of
  the **raw** body — if it's only in client JS, it won't rank.

**Why pin canonical/OG/sitemap origin to `REPLIT_DOMAINS[0]`, not `req` host:**
these pages are served `Cache-Control: public` in production, so deriving the
origin from the incoming `Host` header lets a forged Host on a cached response
poison everyone's canonical/sitemap. Pin to the trusted deployment domain (same
pattern as `routes/donate.ts`); fall back to request host only in dev (uncached,
not indexed).
