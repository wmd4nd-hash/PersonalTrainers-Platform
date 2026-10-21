import "server-only";
import type Stripe from "stripe";

/** Stripe Connect account events (trainer onboarding). Implemented by the payments feature. */
export async function handleConnectEvent(event: Stripe.Event) {
  void event;
}
