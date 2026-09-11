import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/app-config", (_req, res) => {
  // EXPO_DEV_URL (production env var) takes precedence — set it explicitly to the
  // current dev Metro URL so the production site always shows the right address.
  // Falls back to REPLIT_EXPO_DEV_DOMAIN in the dev workspace.
  const expoUrl =
    process.env.EXPO_DEV_URL ??
    (process.env.REPLIT_EXPO_DEV_DOMAIN
      ? `exp://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
      : null);
  res.json({ expoUrl });
});

export default router;
