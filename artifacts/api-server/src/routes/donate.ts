import { Router, type IRouter } from "express";
import {
  CreateDonationCheckoutBody,
  CreateDonationCheckoutResponse,
} from "@workspace/api-zod";
import {
  checkoutUnavailableMessage,
  getUncachableStripeClient,
} from "../lib/stripeClient";
import { rateLimit } from "../middlewares/rateLimit";

const router: IRouter = Router();

// Creating a Checkout session is cheap but hits Stripe; cap it so nobody can
// spam session creation. 10/min per IP is plenty for a real donor.
const donateLimiter = rateLimit({ windowMs: 60_000, max: 10 });

// Where Stripe sends the donor back. We use the canonical public domain
// (mapper.one) rather than the per-environment Replit URL so the donor always
// lands on the branded site; /support resolves to the support page which shows
// a thank-you / cancelled state. Overridable via PUBLIC_SITE_URL if ever needed.
function siteBaseUrl(): string {
  return process.env.PUBLIC_SITE_URL?.trim() || "https://mapper.one";
}

router.post(
  "/community/donate",
  donateLimiter,
  async (req, res): Promise<void> => {
    const parsed = CreateDonationCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { amountCents } = parsed.data;
    // The generated zod schema bounds the range but (an orval limitation) does
    // not enforce integer cents; Stripe requires a whole number of cents.
    if (!Number.isInteger(amountCents)) {
      res.status(400).json({ error: "Amount must be a whole number of cents." });
      return;
    }

    const base = siteBaseUrl();

    let stripe;
    try {
      stripe = await getUncachableStripeClient();
    } catch (err) {
      req.log.error({ err }, "Stripe not configured for donations");
      res.status(503).json({
        error: "Donations aren't available right now. Please try again later.",
      });
      return;
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        submit_type: "donate",
        line_items: [
          {
            quantity: 1,
            // price_data with a custom unit_amount is the correct Stripe pattern
            // for pay-what-you-want donations: the amount is arbitrary per donor,
            // so there is no fixed catalog price to reference.
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: {
                name: "Donation to mapper.one development",
                description:
                  "Thank you for helping keep mapper.one free and open for the wild places.",
              },
            },
          },
        ],
        success_url: `${base}/support?status=success`,
        cancel_url: `${base}/support?status=cancelled`,
      });

      if (!session.url) {
        throw new Error("Stripe returned no checkout URL");
      }

      req.log.info(
        { sessionId: session.id, amountCents },
        "Donation checkout session created",
      );
      res.json(CreateDonationCheckoutResponse.parse({ url: session.url }));
    } catch (err) {
      req.log.error({ err }, "Failed to create donation checkout session");
      res.status(503).json({
        error: checkoutUnavailableMessage(
          err,
          "Couldn't start checkout. Please try again later.",
        ),
      });
    }
  },
);

export default router;
