import type { Request, Response } from "express";
import Stripe from "stripe";
import { activatePrivateProjectFromCheckoutSession } from "../lib/privateProjects";
import { getUncachableStripeClient } from "../lib/stripeClient";

/**
 * Optional signed webhook handler. Browser redirects never activate access;
 * this only shortens the wait when STRIPE_WEBHOOK_SECRET is configured.
 */
export async function receiveStripeWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];
  if (!secret || !signature || Array.isArray(signature)) {
    res.status(400).json({ error: "Webhook is not configured" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature,
      secret,
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const project = await activatePrivateProjectFromCheckoutSession(session.id);
      if (project) {
        req.log.info({ projectId: project.id, sessionId: session.id }, "Private project Stripe webhook processed");
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    req.log.warn({ err }, "Rejected Stripe webhook");
    res.status(400).json({ error: "Invalid webhook signature" });
  }
}