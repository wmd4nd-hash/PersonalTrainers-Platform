import "server-only";
import type Stripe from "stripe";
import { syncRefundedCents } from "../payments";

/**
 * Refunds made outside the app (e.g. from the Stripe dashboard) update the
 * booking or package they belong to. Refunds the app makes are recorded before
 * Stripe is asked, so their events change nothing.
 */
export async function handleChargeEvent(event: Stripe.Event) {
  if (event.type !== "charge.refunded") return;
  const charge = event.data.object;
  const pi = charge.payment_intent;
  const paymentIntentId = typeof pi === "string" ? pi : pi?.id;
  if (!paymentIntentId) return;
  await syncRefundedCents(paymentIntentId, charge.amount_refunded);
}
