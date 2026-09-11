import { Router, type IRouter } from "express";
import { ComputeElevationsBody } from "@workspace/api-zod";

const router: IRouter = Router();

const USER_AGENT = "mapper.one/1.0 (+https://mapper.one)";
const MAX_POINTS = 100;

router.post("/elevation", async (req, res): Promise<void> => {
  const parsed = ComputeElevationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { points } = parsed.data;
  if (points.length === 0) {
    res.json({ elevations: [] });
    return;
  }
  if (points.length > MAX_POINTS) {
    res
      .status(400)
      .json({ error: `Too many points (max ${MAX_POINTS} per request)` });
    return;
  }

  const lats = points.map((p) => p.lat).join(",");
  const lngs = points.map((p) => p.lng).join(",");
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!upstream.ok) {
      req.log.warn(
        { status: upstream.status },
        "Elevation upstream returned non-OK",
      );
      res.json({ elevations: points.map(() => null) });
      return;
    }
    const data = (await upstream.json()) as { elevation?: unknown };
    const raw = Array.isArray(data.elevation) ? data.elevation : [];
    const elevations = points.map((_, i) => {
      const v = raw[i];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    });
    res.json({ elevations });
  } catch (err) {
    req.log.warn({ err }, "Elevation lookup failed");
    res.json({ elevations: points.map(() => null) });
  }
});

export default router;
