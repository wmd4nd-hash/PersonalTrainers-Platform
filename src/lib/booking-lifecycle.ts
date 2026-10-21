import "server-only";
import type { BookingStatus } from "@/generated/prisma/client";
import { db } from "./db";
import { cancellationOutcome, type CancelledBy } from "./cancellation";
import { bookingCancelled } from "./events";
import { restoreCredit } from "./packages";
import { expireCheckout, refundBooking, RefundError } from "./payments";

export type Actor = { id: string; role: "TRAINER" | "CLIENT" | "ADMIN" };

export type CancelResult =
  | { ok: false }
  | {
      ok: true;
      /** What the client gets back (0 for package sessions and unpaid bookings). */
      refundCents: number;
      currency: string;
      late: boolean;
      creditRestored: boolean;
      /** Stripe refused the refund; admins have been asked to sort it out. */
      refundFailed: boolean;
    };

const CANCELLABLE: BookingStatus[] = ["PENDING_PAYMENT", "CONFIRMED"];

/**
 * Cancels a booking on behalf of the client, its trainer or an admin, applying
 * the trainer's cancellation policy: refunds card payments (once, however often
 * this is called), gives package credits back and tells both sides.
 * Returns false if the actor can't cancel it.
 */
export async function cancelBookingAs(actor: Actor, bookingId: string, reason = ""): Promise<boolean> {
  return (await cancelBookingWithOutcome(actor, bookingId, reason)).ok;
}

/** Like cancelBookingAs, but says what happened to the money. */
export async function cancelBookingWithOutcome(actor: Actor, bookingId: string, reason = ""): Promise<CancelResult> {
  // A payment can land between reading the booking and cancelling it; if the
  // status moved under us, read again so the refund matches what was paid.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await tryCancel(actor, bookingId, reason);
    if (result !== "retry") return result;
  }
  return { ok: false };
}

async function tryCancel(actor: Actor, bookingId: string, reason: string): Promise<CancelResult | "retry"> {
  const now = new Date();
  const booking = await db.booking.findFirst({
    where: {
      id: bookingId,
      status: { in: CANCELLABLE },
      startsAt: { gt: now },
      ...(actor.role === "ADMIN"
        ? {}
        : { OR: [{ clientId: actor.id }, { trainer: { userId: actor.id } }] }),
    },
    include: { trainer: true },
  });
  if (!booking) return { ok: false };

  const cancelledBy: CancelledBy =
    actor.role === "ADMIN" ? "ADMIN" : booking.clientId === actor.id ? "CLIENT" : "TRAINER";
  const paidByCard = booking.status === "CONFIRMED" && !booking.packagePurchaseId;
  const outcome = cancellationOutcome({
    startsAt: booking.startsAt,
    now,
    cancelledBy,
    windowHours: booking.trainer.cancellationWindowHours,
    lateFeePercent: booking.trainer.lateCancelFeePercent,
    paidCents: paidByCard ? booking.priceCents - booking.refundedCents : 0,
  });
  const giveCreditBack = Boolean(booking.packagePurchaseId) && outcome.restoreCredit;

  // Only the call that flips the status goes on to refund, so the refund and
  // the credit happen exactly once.
  const cancelled = await db.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, status: booking.status },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledById: actor.id,
        cancellationReason: reason,
      },
    });
    if (count > 0 && giveCreditBack) await restoreCredit(tx, booking.packagePurchaseId!, now);
    return count > 0;
  });
  if (!cancelled) {
    const current = await db.booking.findUnique({ where: { id: booking.id }, select: { status: true } });
    return current && CANCELLABLE.includes(current.status) ? "retry" : { ok: false };
  }

  if (booking.status === "PENDING_PAYMENT") {
    // Close the checkout so the client can't pay for a cancelled booking.
    await expireCheckout(booking.stripeCheckoutSessionId);
    return { ok: true, refundCents: 0, currency: booking.currency, late: false, creditRestored: false, refundFailed: false };
  }

  let refundFailed = false;
  if (paidByCard && outcome.refundCents > 0) {
    try {
      await refundBooking(booking.id, outcome.refundCents);
    } catch (err) {
      if (!(err instanceof RefundError)) throw err;
      refundFailed = true;
    }
  }
  const refundCents = paidByCard ? outcome.refundCents : 0;
  await bookingCancelled(booking.id, { refundCents });
  return {
    ok: true,
    refundCents,
    currency: booking.currency,
    late: outcome.late,
    creditRestored: giveCreditBack,
    refundFailed,
  };
}

/** Trainer marks a past confirmed session as done. */
export async function completeBookingAs(actor: Actor, bookingId: string) {
  const { count } = await db.booking.updateMany({
    where: {
      id: bookingId,
      status: "CONFIRMED",
      startsAt: { lt: new Date() },
      ...(actor.role === "ADMIN" ? {} : { trainer: { userId: actor.id } }),
    },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  return count > 0;
}
