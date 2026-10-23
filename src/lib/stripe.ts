import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Returns a Stripe client, or null when STRIPE_SECRET_KEY is not set.
 * Without Stripe, bookings are confirmed immediately (local development).
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

export function appUrl(path = "") {
  // RENDER_EXTERNAL_URL is set automatically on Render.
  const base = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";
  return new URL(path, base).toString();
}
