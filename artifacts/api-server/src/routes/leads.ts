import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateTeamsEarlyAccessLeadBody,
  CreateTeamsEarlyAccessLeadResponse,
} from "@workspace/api-zod";
import { db, earlyAccessLeadsTable } from "@workspace/db";
import { rateLimit } from "../middlewares/rateLimit";

const router: IRouter = Router();
const leadSubmissionLimiter = rateLimit({ windowMs: 60_000, max: 8 });

router.post(
  "/leads/teams-early-access",
  leadSubmissionLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateTeamsEarlyAccessLeadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a valid email and confirm consent." });
      return;
    }
    if (!parsed.data.consented) {
      res.status(400).json({ error: "Enter a valid email and confirm consent." });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    await db
      .insert(earlyAccessLeadsTable)
      .values({ email, source: "teams_landing_page" })
      .onConflictDoNothing({ target: earlyAccessLeadsTable.email });

    const response = CreateTeamsEarlyAccessLeadResponse.parse({
      accepted: true,
    });
    res.status(200).json(response);
  },
);

export default router;