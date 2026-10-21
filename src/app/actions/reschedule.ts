"use server";

import { addMinutes } from "date-fns";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { getBusyPeriods } from "@/lib/bookings";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { formatSlot, isSlotAvailable, reschedulePolicy } from "@/lib/scheduling";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";
import { rescheduleSchema } from "@/lib/validation/scheduling";

class SlotTakenError extends Error {}
class BookingChangedError extends Error {}

/**
 * Moves a confirmed booking to another free slot with the same trainer and
 * format. The client or the trainer can do this (see `reschedulePolicy`).
 */
export async function rescheduleBooking(
  bookingId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = rescheduleSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { startsAt } = parsed.data;

  // Only the booking's own client or trainer can find it.
  const booking = await db.booking.findFirst({
    where: { id: bookingId, OR: [{ clientId: user.id }, { trainer: { userId: user.id } }] },
    include: {
      client: { select: { name: true } },
      trainer: { include: { availability: true, user: { select: { name: true } } } },
    },
  });
  if (!booking) return { error: "We couldn't find that session." };
  if (booking.status !== "CONFIRMED") return { error: "Only confirmed sessions can be moved." };

  const actor = booking.clientId === user.id ? "CLIENT" : "TRAINER";
  const { trainer } = booking;
  const policy = reschedulePolicy({
    actor,
    startsAt: booking.startsAt,
    now: new Date(),
    windowHours: trainer.cancellationWindowHours,
  });
  if (!policy.allowed) return { error: policy.reason };
  if (startsAt.getTime() === booking.startsAt.getTime()) {
    return { fieldErrors: { startsAt: ["That's the current time. Pick a different one."] } };
  }

  // Keep the length that was booked and paid for.
  const durationMinutes = Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000);

  try {
    // Serializable so a client can't book the new slot while we move into it.
    await db.$transaction(
      async (tx) => {
        const now = new Date();
        const busy = await getBusyPeriods(trainer.id, now, tx, { excludeBookingId: booking.id });
        const available = isSlotAvailable(startsAt, {
          windows: trainer.availability,
          busy,
          timezone: trainer.timezone,
          sessionMinutes: durationMinutes,
          now,
          minNoticeMinutes: trainer.minNoticeHours * 60,
        });
        if (!available) throw new SlotTakenError();

        const { count } = await tx.booking.updateMany({
          where: { id: booking.id, status: "CONFIRMED", startsAt: booking.startsAt },
          data: {
            startsAt,
            endsAt: addMinutes(startsAt, durationMinutes),
            // The reminder for the old time no longer applies.
            reminderSentAt: null,
          },
        });
        if (count === 0) throw new BookingChangedError();
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof BookingChangedError) {
      return { error: "This session changed while you were choosing. Please reload and try again." };
    }
    const conflict =
      err instanceof SlotTakenError ||
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034");
    if (conflict) return { error: "That time was just taken. Please pick another slot." };
    throw err;
  }

  const from = formatSlot(booking.startsAt, trainer.timezone);
  const to = formatSlot(startsAt, trainer.timezone);
  const link = `/dashboard/bookings/${booking.id}`;
  after(() =>
    actor === "CLIENT"
      ? notify({
          userId: trainer.userId,
          type: "booking.rescheduled",
          title: `${booking.client.name} moved a session`,
          body: `${booking.client.name} moved their session from ${from} to ${to}.`,
          link,
          email: true,
        })
      : notify({
          userId: booking.clientId,
          type: "booking.rescheduled",
          title: `${trainer.user.name} moved your session`,
          body: `Your session on ${from} is now on ${to}. If the new time doesn't work, you can cancel or move it from the booking page.`,
          link,
          email: true,
        }),
  );

  redirect(`${link}?rescheduled=1`);
}
