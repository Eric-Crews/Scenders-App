// Stripe client backed by the Replit Stripe integration (connector: stripe).
// Credentials are fetched fresh from the Replit connection API on every call —
// never cache the returned client, tokens expire. We only use the secret-key
// client here (server-side Checkout session creation for donations); the sync
// helpers from the integration snippet are intentionally omitted because
// donations are fire-and-forget and we do not persist Stripe entities.
import Stripe from "stripe";

let connectionSettings: { settings?: { publishable?: string; secret?: string } } | undefined;

async function getCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  // Published deployments can use the explicitly managed live secrets. Keep
  // development on the Replit connector so local testing does not accidentally
  // create live charges when shared production secrets are present.
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const productionSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (isProduction && productionSecretKey) {
    return {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY?.trim() ?? "",
      secretKey: productionSecretKey,
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  const connectorName = "stripe";
  const targetEnvironment = isProduction ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", connectorName);
  url.searchParams.set("environment", targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Replit-Token": xReplitToken,
    },
  });

  const data = (await response.json()) as {
    items?: { settings?: { publishable?: string; secret?: string } }[];
  };

  connectionSettings = data.items?.[0];

  if (
    !connectionSettings ||
    !connectionSettings.settings?.publishable ||
    !connectionSettings.settings?.secret
  ) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

// WARNING: Never cache this client. Always call this function again for a fresh
// client because the underlying credentials expire.
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, {
    apiVersion: "2025-11-17.clover",
  });
}

/** A safe, user-facing message for Stripe connection failures. */
export function checkoutUnavailableMessage(err: unknown, fallback: string): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  if (code === "api_key_expired") {
    return "Stripe payments are temporarily unavailable. Please try again later.";
  }
  return fallback;
}
