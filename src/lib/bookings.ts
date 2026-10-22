import "server-only";
import { subMinutes } from "date-fns";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { PAYMENT_HOLD_MINUTES, type BusyPeriod } from "./scheduling";

type Tx = Prisma.TransactionClient;

/**
 * Bookings that block a trainer's calendar: confirmed sessions, plus unpaid
 * ones still inside their checkout hold.
 */
export function blockingBookingsWhere(trainerId: string, now: Date): Prisma.BookingWhereInput {
  return {
    trainerId,
    endsAt: { gt: now },
    OR: [
      { status: { in: ["CONFIRMED", "COMPLETED"] } },
      {
        status: "PENDING_PAYMENT",
        createdAt: { gt: subMinutes(now, PAYMENT_HOLD_MINUTES) },
      },
    ],
  };
}

export type BusyPeriodOptions = {
  /** Leave this booking out, e.g. when it is being moved to another time. */
  excludeBookingId?: string;
};

/** Everything that stops a client booking a time: blocking bookings and the trainer's time off. */
export async function getBusyPeriods(
  trainerId: string,
  now: Date,
  client: Tx = db,
  { excludeBookingId }: BusyPeriodOptions = {},
): Promise<BusyPeriod[]> {
  const where = blockingBookingsWhere(trainerId, now);
  // Sequential on purpose: `client` may be an interactive transaction.
  const bookings = await client.booking.findMany({
    where: excludeBookingId ? { AND: [where, { id: { not: excludeBookingId } }] } : where,
    select: { startsAt: true, endsAt: true },
  });
  const timeOff = await client.timeOff.findMany({
    where: { trainerId, endsAt: { gt: now } },
    select: { startsAt: true, endsAt: true },
  });
  return [...bookings, ...timeOff];
}

export const BOOKING_TABS = ["upcoming", "past", "cancelled"] as const;
export type BookingTab = (typeof BOOKING_TABS)[number];

/** Reads ?tab=, defaulting to upcoming. */
export function parseBookingTab(value: unknown): BookingTab {
  return BOOKING_TABS.find((tab) => tab === value) ?? "upcoming";
}

/** The signed-in user's side of their bookings. */
export function participantWhere(user: { id: string; role: string }): Prisma.BookingWhereInput {
  return user.role === "TRAINER" ? { trainer: { userId: user.id } } : { clientId: user.id };
}

/**
 * Which bookings each overview tab lists. Trainers don't see unpaid bookings
 * as upcoming; sessions that have ended but weren't marked done are "past".
 */
export function bookingTabWhere(tab: BookingTab, role: string, now: Date): Prisma.BookingWhereInput {
  switch (tab) {
    case "upcoming":
      return {
        endsAt: { gt: now },
        status: role === "TRAINER" ? "CONFIRMED" : { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      };
    case "past":
      return { endsAt: { lte: now }, status: { in: ["CONFIRMED", "COMPLETED"] } };
    case "cancelled":
      return { status: "CANCELLED" };
  }
}
