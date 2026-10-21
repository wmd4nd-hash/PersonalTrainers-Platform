"use server";

import { addMinutes } from "date-fns";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireRole, requireUser } from "@/lib/auth";
import { cancelBookingAs, completeBookingAs } from "@/lib/booking-lifecycle";
import { getBusyPeriods } from "@/lib/bookings";
import { db } from "@/lib/db";
import { bookingConfirmed } from "@/lib/events";
import { consumeCredit, CreditUnavailableError } from "@/lib/packages";
import { beginBookingCheckout } from "@/lib/payments";
import { isSlotAvailable } from "@/lib/scheduling";
import { meetingUrlFor } from "@/lib/sessions";
import { bookingSchema, fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";

class SlotTakenError extends Error {}

export async function createBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const client = await requireRole("CLIENT");
  const parsed = bookingSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { trainerId, startsAt, notes, format, packagePurchaseId } = parsed.data;

  const trainer = await db.trainerProfile.findFirst({
    where: { id: trainerId, published: true, user: { suspendedAt: null } },
    include: { availability: true },
  });
  if (!trainer) return { error: "This trainer is not taking bookings" };
  if (format === "ONLINE" ? !trainer.offersOnline : !trainer.offersInPerson) {
    return { error: "This trainer doesn't offer that type of session" };
  }

  let bookingId: string;
  let paidWithPackage = false;
  try {
    // Serializable so two clients can't take the same slot (or the same credit) at once.
    const booking = await db.$transaction(
      async (tx) => {
        const now = new Date();
        const busy = await getBusyPeriods(trainer.id, now, tx);
        const available = isSlotAvailable(startsAt, {
          windows: trainer.availability,
          busy,
          timezone: trainer.timezone,
          sessionMinutes: trainer.sessionMinutes,
          now,
          minNoticeMinutes: trainer.minNoticeHours * 60,
        });
        if (!available) throw new SlotTakenError();

        const credit = packagePurchaseId
          ? await consumeCredit(tx, { purchaseId: packagePurchaseId, clientId: client.id, trainerId: trainer.id, now })
          : null;

        const created = await tx.booking.create({
          data: {
            trainerId: trainer.id,
            clientId: client.id,
            startsAt,
            endsAt: addMinutes(startsAt, trainer.sessionMinutes),
            format,
            location: format === "IN_PERSON" ? trainer.defaultLocation : "",
            priceCents: credit ? credit.perSessionCents : trainer.sessionRateCents,
            currency: credit ? credit.currency : trainer.currency,
            status: credit ? "CONFIRMED" : "PENDING_PAYMENT",
            packagePurchaseId: credit ? packagePurchaseId : null,
            notes,
          },
          select: { id: true },
        });
        if (format === "ONLINE") {
          await tx.booking.update({
            where: { id: created.id },
            data: { meetingUrl: meetingUrlFor(trainer, created.id) },
          });
        }
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    bookingId = booking.id;
    paidWithPackage = Boolean(packagePurchaseId);
  } catch (err) {
    if (err instanceof CreditUnavailableError) {
      return { error: "That package has no sessions left. Choose another way to pay." };
    }
    const conflict =
      err instanceof SlotTakenError ||
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034");
    if (conflict) return { error: "That time was just taken. Please pick another slot." };
    throw err;
  }

  if (paidWithPackage) {
    await bookingConfirmed(bookingId);
    redirect(`/dashboard/bookings/${bookingId}?booked=1`);
  }
  redirect(await beginBookingCheckout(bookingId));
}

export async function cancelBooking(bookingId: string, formData?: FormData) {
  const user = await requireUser();
  const reason = String(formData?.get("reason") ?? "").trim().slice(0, 300);
  await cancelBookingAs(user, bookingId, reason);
  refresh();
}

export async function completeBooking(bookingId: string) {
  const user = await requireRole("TRAINER");
  await completeBookingAs(user, bookingId);
  refresh();
}
