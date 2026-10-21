import "server-only";
import type Stripe from "stripe";
import { db } from "../db";
import { markBookingPaid, markPackagePaid } from "../payments";

function paymentIntentId(session: Stripe.Checkout.Session) {
  const pi = session.payment_intent;
  return typeof pi === "string" ? pi : pi?.id;
}

export async function handleCheckoutEvent(event: Stripe.Event) {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired") return;
  const session = event.data.object;
  const { kind, bookingId, purchaseId } = session.metadata ?? {};
  const paid = event.type === "checkout.session.completed" && session.payment_status === "paid";
  const ids = { checkoutSessionId: session.id, paymentIntentId: paymentIntentId(session) };

  // Bookings created before `kind` existed only carry bookingId.
  if ((kind === "booking" || !kind) && bookingId) {
    if (paid) await markBookingPaid(bookingId, ids);
    else if (event.type === "checkout.session.expired") {
      await db.booking.updateMany({
        where: { id: bookingId, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Checkout expired" },
      });
    }
  } else if (kind === "package" && purchaseId) {
    if (paid) await markPackagePaid(purchaseId, ids);
    else if (event.type === "checkout.session.expired") {
      await db.packagePurchase.updateMany({
        where: { id: purchaseId, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED" },
      });
    }
  }
}
