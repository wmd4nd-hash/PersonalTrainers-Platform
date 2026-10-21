import "server-only";
import { db } from "./db";
import { cancellationOutcome, type CancelledBy } from "./cancellation";
import { bookingCancelled } from "./events";
import { restoreCredit } from "./packages";
import { refundBooking } from "./payments";

export type Actor = { id: string; role: "TRAINER" | "CLIENT" | "ADMIN" };

/**
 * Cancels a booking on behalf of the client, its trainer or an admin, applying
 * the trainer's cancellation policy. Returns false if the actor can't cancel it.
 */
export async function cancelBookingAs(actor: Actor, bookingId: string, reason = "") {
  const now = new Date();
  const booking = await db.booking.findFirst({
    where: {
      id: bookingId,
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      startsAt: { gt: now },
      ...(actor.role === "ADMIN"
        ? {}
        : { OR: [{ clientId: actor.id }, { trainer: { userId: actor.id } }] }),
    },
    include: { trainer: true },
  });
  if (!booking) return false;

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

  const cancelled = await db.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledById: actor.id,
        cancellationReason: reason,
      },
    });
    if (count > 0 && booking.packagePurchaseId && outcome.restoreCredit) {
      await restoreCredit(tx, booking.packagePurchaseId, now);
    }
    return count > 0;
  });
  if (!cancelled) return false;

  if (paidByCard) await refundBooking(booking.id, outcome.refundCents);
  if (booking.status === "CONFIRMED") {
    await bookingCancelled(booking.id, { refundCents: paidByCard ? outcome.refundCents : 0 });
  }
  return true;
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
