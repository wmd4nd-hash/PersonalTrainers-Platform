import "server-only";
import { addMinutes } from "date-fns";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { bookingConfirmed, packageActivated } from "./events";
import { platformFeeCents } from "./fees";
import { CHECKOUT_EXPIRY_MINUTES } from "./scheduling";
import { appUrl, getStripe } from "./stripe";

type Tx = Prisma.TransactionClient;

/** True when real card payments are configured. Otherwise payments are simulated. */
export function paymentsEnabled() {
  return getStripe() !== null;
}

/** A client is "new" to a trainer until they have paid for a session or package with them. */
export async function isNewClient(trainerId: string, clientId: string, client: Tx = db) {
  const [paidBookings, paidPackages] = await Promise.all([
    client.booking.count({
      where: { trainerId, clientId, status: { in: ["CONFIRMED", "COMPLETED"] }, packagePurchaseId: null },
    }),
    client.packagePurchase.count({
      where: { trainerId, clientId, status: { in: ["ACTIVE", "EXHAUSTED", "EXPIRED"] } },
    }),
  ]);
  return paidBookings + paidPackages === 0;
}

/**
 * Starts payment for a PENDING_PAYMENT booking and returns the URL to send the
 * client to. Without Stripe the booking is confirmed straight away.
 */
export async function beginBookingCheckout(bookingId: string): Promise<string> {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { client: true, trainer: { include: { user: true } } },
  });
  const fee = platformFeeCents(booking.priceCents, {
    isNewClient: await isNewClient(booking.trainerId, booking.clientId),
  });
  await db.booking.update({ where: { id: bookingId }, data: { platformFeeCents: fee } });

  const stripe = getStripe();
  if (!stripe) {
    await markBookingPaid(bookingId, {});
    return `/dashboard/bookings/${bookingId}?booked=1`;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: booking.client.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: booking.currency,
          unit_amount: booking.priceCents,
          product_data: {
            name: `${booking.trainer.sessionMinutes}-minute session with ${booking.trainer.user.name}`,
          },
        },
      },
    ],
    metadata: { kind: "booking", bookingId },
    expires_at: Math.floor(addMinutes(new Date(), CHECKOUT_EXPIRY_MINUTES).getTime() / 1000),
    success_url: appUrl(`/dashboard/bookings/${bookingId}?booked=1`),
    cancel_url: appUrl(`/trainers/${booking.trainerId}?cancelled=1`),
  });
  await db.booking.update({ where: { id: bookingId }, data: { stripeCheckoutSessionId: session.id } });
  return session.url!;
}

/** Marks a booking paid (idempotent) and fires the confirmation event. */
export async function markBookingPaid(
  bookingId: string,
  ids: { checkoutSessionId?: string; paymentIntentId?: string },
) {
  const { count } = await db.booking.updateMany({
    where: { id: bookingId, status: "PENDING_PAYMENT" },
    data: {
      status: "CONFIRMED",
      ...(ids.checkoutSessionId && { stripeCheckoutSessionId: ids.checkoutSessionId }),
      ...(ids.paymentIntentId && { stripePaymentIntentId: ids.paymentIntentId }),
    },
  });
  if (count > 0) await bookingConfirmed(bookingId);
}

/** Starts payment for a PENDING_PAYMENT package purchase; returns the redirect URL. */
export async function beginPackageCheckout(purchaseId: string): Promise<string> {
  const purchase = await db.packagePurchase.findUniqueOrThrow({
    where: { id: purchaseId },
    include: { client: true, package: true, trainer: { include: { user: true } } },
  });
  const fee = platformFeeCents(purchase.priceCents, {
    isNewClient: await isNewClient(purchase.trainerId, purchase.clientId),
  });
  await db.packagePurchase.update({ where: { id: purchaseId }, data: { platformFeeCents: fee } });

  const stripe = getStripe();
  if (!stripe) {
    await markPackagePaid(purchaseId, {});
    return `/dashboard/packages?purchased=${purchaseId}`;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: purchase.client.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: purchase.currency,
          unit_amount: purchase.priceCents,
          product_data: { name: `${purchase.package.title} with ${purchase.trainer.user.name}` },
        },
      },
    ],
    metadata: { kind: "package", purchaseId },
    expires_at: Math.floor(addMinutes(new Date(), CHECKOUT_EXPIRY_MINUTES).getTime() / 1000),
    success_url: appUrl(`/dashboard/packages?purchased=${purchaseId}`),
    cancel_url: appUrl(`/trainers/${purchase.trainerId}?cancelled=1`),
  });
  await db.packagePurchase.update({
    where: { id: purchaseId },
    data: { stripeCheckoutSessionId: session.id },
  });
  return session.url!;
}

export async function markPackagePaid(
  purchaseId: string,
  ids: { checkoutSessionId?: string; paymentIntentId?: string },
) {
  const { count } = await db.packagePurchase.updateMany({
    where: { id: purchaseId, status: "PENDING_PAYMENT" },
    data: {
      status: "ACTIVE",
      ...(ids.checkoutSessionId && { stripeCheckoutSessionId: ids.checkoutSessionId }),
      ...(ids.paymentIntentId && { stripePaymentIntentId: ids.paymentIntentId }),
    },
  });
  if (count > 0) await packageActivated(purchaseId);
}

/** Refunds part or all of a card-paid booking. No-op for 0. */
export async function refundBooking(bookingId: string, amountCents: number) {
  if (amountCents <= 0) return;
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const stripe = getStripe();
  if (stripe && booking.stripePaymentIntentId) {
    await stripe.refunds.create({ payment_intent: booking.stripePaymentIntentId, amount: amountCents });
  }
  await db.booking.update({
    where: { id: bookingId },
    data: { refundedCents: { increment: amountCents } },
  });
}

export async function refundPackage(purchaseId: string, amountCents: number) {
  if (amountCents <= 0) return;
  const purchase = await db.packagePurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  const stripe = getStripe();
  if (stripe && purchase.stripePaymentIntentId) {
    await stripe.refunds.create({ payment_intent: purchase.stripePaymentIntentId, amount: amountCents });
  }
  await db.packagePurchase.update({
    where: { id: purchaseId },
    data: { refundedCents: { increment: amountCents } },
  });
}
