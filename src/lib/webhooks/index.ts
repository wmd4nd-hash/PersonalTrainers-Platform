import "server-only";
import type Stripe from "stripe";
import { handleChargeEvent } from "./charges";
import { handleCheckoutEvent } from "./checkout";
import { handleConnectEvent } from "./connect";

/** Routes a verified Stripe event to the module that owns it. */
export async function handleStripeEvent(event: Stripe.Event) {
  await handleCheckoutEvent(event);
  await handleConnectEvent(event);
  await handleChargeEvent(event);
}
