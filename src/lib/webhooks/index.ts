import "server-only";
import type Stripe from "stripe";
import { handleCheckoutEvent } from "./checkout";
import { handleConnectEvent } from "./connect";

/** Routes a verified Stripe event to the module that owns it. */
export async function handleStripeEvent(event: Stripe.Event) {
  await handleCheckoutEvent(event);
  await handleConnectEvent(event);
}
