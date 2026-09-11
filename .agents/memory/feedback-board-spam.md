---
name: Anonymous feedback board spam/abuse hardening
description: Decisions for the unauthed community feedback board — URL guard breadth, per-IP rate limit trust model, upvote toggle concurrency.
---

# Anonymous community feedback board — abuse hardening

The board (web route `/feedback`, mobile `discussions`) accepts posts/replies with
only a display name, no login. That makes it a spam magnet, which drove three
non-obvious decisions.

## URL/hyperlink rejection is deliberately broad
The content guard rejects anything hostname-shaped: explicit schemes, `www.`,
markdown link/image syntax `](...)`, any `domain.tld/path`, and a wide bare-TLD
list (including `.ai .edu .gov` ccTLDs etc.).
**Why:** the original guard only listed a handful of TLDs, so `example.ai` and
markdown links slipped through. On an unauthed board, a few false positives are an
acceptable tradeoff for not leaking SEO-spam/phishing links.
**How to apply:** if a user complains a legit post was blocked, widen carefully —
do not narrow the TLD list back down. Guard lives in api-server `lib/contentGuard.ts`.

## Per-IP rate limiter: trust proxy = 1, never `true`
**Why:** `trust proxy = true` trusts the entire X-Forwarded-For chain, so a client
can prepend a fake leftmost IP and evade the per-IP limiter. Behind the single
Replit reverse proxy, trusting exactly one hop gives the real client IP.
**How to apply:** keep it at `1`. Only raise it if an additional trusted proxy hop
is genuinely added in front.

## Upvote toggle must be concurrency-safe
The vote table has unique `(post_id, client_id)`. The toggle reads-then-writes in a
transaction, so two concurrent toggles from the same client could both insert and
raise a unique violation (500).
**Why/fix:** insert uses `onConflictDoNothing()`, and the response recomputes BOTH
the upvote count and the client's `voted` flag from the votes table at the end of
the tx — never from the pre-read. The denormalized `upvotes` counter is always
recomputed from source-of-truth votes so it can't drift.
**How to apply:** any new vote-like toggle should follow the same recompute-at-end
pattern rather than incrementing a counter or trusting the initial read.
