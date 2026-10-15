import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

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

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) return Response.json({ received: true });

    const paid = event.type === "checkout.session.completed" && session.payment_status === "paid";
    const expired = event.type === "checkout.session.expired";
    if (paid || expired) {
      await db.booking.updateMany({
        where: { id: bookingId, status: "PENDING_PAYMENT" },
        data: {
          status: paid ? "CONFIRMED" : "CANCELLED",
          stripeCheckoutSessionId: session.id,
        },
      });
    }
  }

  return Response.json({ received: true });
}
