import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/webhooks";

export async function POST(request: Request) {
  const stripe = getStripe();
  // Connect events (trainer accounts) come from a separate endpoint with its own secret.
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => Boolean(s),
  );
  if (!stripe || secrets.length === 0) {
    return new Response("Stripe is not configured", { status: 501 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await request.text();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      break;
    } catch {
      // Try the next secret.
    }
  }
  if (!event) return new Response("Invalid signature", { status: 400 });

  await handleStripeEvent(event);
  return Response.json({ received: true });
}
