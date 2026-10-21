import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/webhooks";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return new Response("Stripe is not configured", { status: 501 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  await handleStripeEvent(event);
  return Response.json({ received: true });
}
