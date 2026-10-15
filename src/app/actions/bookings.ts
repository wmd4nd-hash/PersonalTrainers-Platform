"use server";

import { addMinutes } from "date-fns";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireRole, requireUser } from "@/lib/auth";
import { getBusyPeriods } from "@/lib/bookings";
import { db } from "@/lib/db";
import { CHECKOUT_EXPIRY_MINUTES, isSlotAvailable } from "@/lib/scheduling";
import { appUrl, getStripe } from "@/lib/stripe";
import { bookingSchema, fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";

class SlotTakenError extends Error {}

export async function createBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const client = await requireRole("CLIENT");
  const parsed = bookingSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { trainerId, startsAt, notes } = parsed.data;

  const trainer = await db.trainerProfile.findFirst({
    where: { id: trainerId, published: true },
    include: { availability: true, user: { select: { name: true } } },
  });
  if (!trainer) return { error: "This trainer is not taking bookings" };

  let bookingId: string;
  try {
    // Serializable so two clients can't take the same slot at once.
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
        });
        if (!available) throw new SlotTakenError();

        return tx.booking.create({
          data: {
            trainerId: trainer.id,
            clientId: client.id,
            startsAt,
            endsAt: addMinutes(startsAt, trainer.sessionMinutes),
            priceCents: trainer.sessionRateCents,
            currency: trainer.currency,
            notes,
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    bookingId = booking.id;
  } catch (err) {
    const conflict =
      err instanceof SlotTakenError ||
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034");
    if (conflict) return { error: "That time was just taken. Please pick another slot." };
    throw err;
  }

  const stripe = getStripe();
  if (!stripe) {
    // No payments configured (local development): confirm straight away.
    await db.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED" } });
    redirect(`/dashboard?booked=${bookingId}`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: client.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: trainer.currency,
          unit_amount: trainer.sessionRateCents,
          product_data: {
            name: `${trainer.sessionMinutes}-minute session with ${trainer.user.name}`,
          },
        },
      },
    ],
    metadata: { bookingId },
    expires_at: Math.floor(addMinutes(new Date(), CHECKOUT_EXPIRY_MINUTES).getTime() / 1000),
    success_url: appUrl(`/dashboard?booked=${bookingId}`),
    cancel_url: appUrl(`/trainers/${trainer.id}?cancelled=1`),
  });

  await db.booking.update({
    where: { id: bookingId },
    data: { stripeCheckoutSessionId: session.id },
  });
  redirect(session.url!);
}

export async function cancelBooking(bookingId: string) {
  const user = await requireUser();
  await db.booking.updateMany({
    where: {
      id: bookingId,
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      startsAt: { gt: new Date() },
      OR: [{ clientId: user.id }, { trainer: { userId: user.id } }],
    },
    data: { status: "CANCELLED" },
  });
  refresh();
}

export async function completeBooking(bookingId: string) {
  const user = await requireRole("TRAINER");
  await db.booking.updateMany({
    where: {
      id: bookingId,
      status: "CONFIRMED",
      startsAt: { lt: new Date() },
      trainer: { userId: user.id },
    },
    data: { status: "COMPLETED" },
  });
  refresh();
}
