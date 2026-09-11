import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import seoRouter from "./routes/seo";
import sharePageRouter from "./routes/sharePage";
import reportPageRouter from "./routes/reportPage";
import mapPageRouter from "./routes/maps";
import { resumeTrailGuideQueue, trailGuidesPageRouter } from "./routes/trailGuides";
import { receiveStripeWebhook } from "./routes/stripeWebhook";
import { supportStaffPageRouter } from "./routes/support";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

function safeRequestPath(url: string | undefined): string | undefined {
  const path = url?.split("?")[0];
  if (!path) return path;
  if (/^\/s\/[^/]+$/.test(path)) return "/s/[private-token]";
  if (/^\/api\/live\/[^/]+(?:\/|$)/.test(path)) {
    return "/api/live/[live-token]";
  }
  if (/^\/live\/[^/]+$/.test(path)) return "/live/[live-token]";
  if (/^\/api\/private-projects\/[^/]+(?:\/|$)/.test(path)) {
    return "/api/private-projects/[private-token]";
  }
  if (/^\/api\/shared\/live\/[^/]+(?:\/|$)/.test(path)) {
    return "/api/shared/live/[live-token]";
  }
  return path;
}

const app: Express = express();

// Behind the Replit reverse proxy. Trust exactly one hop so req.ip reflects the
// real client for the feedback board's per-IP rate limiting, without trusting
// the entire X-Forwarded-For chain (which would let clients spoof their IP and
// evade the limiter).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: safeRequestPath(req.url),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
// Must precede express.json() so Stripe's signature covers the original bytes.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  receiveStripeWebhook,
);
// 10MB cap protects the public community upload endpoint and large GeoJSON datasets from abuse.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(authMiddleware);

// Server-rendered SEO pages live at the site root (/compare, /sitemap.xml,
// /robots.txt) and are routed here by the reverse proxy. Mounted before /api.
app.use(seoRouter);
app.use(mapPageRouter);
app.use(trailGuidesPageRouter);
app.use(supportStaffPageRouter);

// Public and paid route-share viewer pages live at the site root (/r/:token,
// /s/:token) and are
// routed here by the reverse proxy (see artifact.toml `paths`). Mounted before
// /api so the friendly /r link resolves to a real HTML page.
app.use(sharePageRouter);
app.use(reportPageRouter);

app.use("/api", router);

// Recover a safely-serialized in-process guide queue after a server restart.
resumeTrailGuideQueue();

export default app;
