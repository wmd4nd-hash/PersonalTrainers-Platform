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

export async function getBusyPeriods(
  trainerId: string,
  now: Date,
  client: Tx = db,
): Promise<BusyPeriod[]> {
  return client.booking.findMany({
    where: blockingBookingsWhere(trainerId, now),
    select: { startsAt: true, endsAt: true },
  });
}
