import "server-only";
import type Stripe from "stripe";
import { applyAccountUpdate, disconnectAccount } from "../payments";

/** Stripe Connect account events: keeps each trainer's payout status in step with Stripe. */
export async function handleConnectEvent(event: Stripe.Event) {
  switch (event.type) {
    case "account.updated":
      await applyAccountUpdate(event.data.object);
      break;
    case "account.application.deauthorized":
      // The trainer disconnected the platform from their Stripe account.
      if (event.account) await disconnectAccount(event.account);
      break;
  }
}
