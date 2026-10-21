import "server-only";
import type Stripe from "stripe";
import { db } from "../db";
import { markBookingPaid, markPackagePaid } from "../payments";

function paymentIntentId(session: Stripe.Checkout.Session) {
  const pi = session.payment_intent;
  return (typeof pi === "string" ? pi : pi?.id) ?? undefined;
}

/**
 * Checkout sessions for bookings and packages (metadata `kind` = booking or
 * package). Completed and paid: confirm and record the payment intent. Expired
 * or failed: release the unpaid booking or purchase. Safe to receive twice.
 */
export async function handleCheckoutEvent(event: Stripe.Event) {
  let paid: boolean;
  switch (event.type) {
    case "checkout.session.completed":
      paid = event.data.object.payment_status === "paid";
      break;
    case "checkout.session.async_payment_succeeded":
      paid = true;
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      paid = false;
      break;
    default:
      return;
  }
  const session = event.data.object;
  // Completed but not yet paid (a delayed payment method): wait for the async event.
  if (!paid && event.type === "checkout.session.completed") return;

  const { kind, bookingId, purchaseId } = session.metadata ?? {};
  const ids = { checkoutSessionId: session.id, paymentIntentId: paymentIntentId(session) };

  // Bookings created before `kind` existed only carry bookingId.
  if ((kind === "booking" || !kind) && bookingId) {
    if (paid) await markBookingPaid(bookingId, ids);
    else {
      await db.booking.updateMany({
        where: { id: bookingId, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Checkout expired" },
      });
    }
  } else if (kind === "package" && purchaseId) {
    if (paid) await markPackagePaid(purchaseId, ids);
    else {
      await db.packagePurchase.updateMany({
        where: { id: purchaseId, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED" },
      });
    }
  }
}
