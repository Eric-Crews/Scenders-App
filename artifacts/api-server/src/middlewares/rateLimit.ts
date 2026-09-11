import { type Request, type Response, type NextFunction } from "express";

// Lightweight in-memory, per-IP fixed-window rate limiter. This is intentionally
// simple: the feedback board is anonymous and unauthed, so the goal is to blunt
// trivial flooding, not to be a distributed rate limiter. State is per-process
// and resets on restart, which is fine for this use case.

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function rateLimit({ windowMs, max }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const now = Date.now();
    // express `trust proxy` makes req.ip reflect the real client behind the
    // Replit reverse proxy. Fall back to a constant so a missing IP still
    // shares a single bucket rather than bypassing the limit entirely.
    const key = req.ip ?? "unknown";

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
        // Keep the IP only in this in-memory bucket key. Do not write it to
        // logs, which would turn a transient abuse-control signal into history.
        req.log.warn("Rate limit exceeded");
      res
        .status(429)
        .json({ error: "Too many requests. Please slow down and try again." });
      return;
    }

    // Opportunistic cleanup so the map doesn't grow unbounded over time.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }

    next();
  };
}
