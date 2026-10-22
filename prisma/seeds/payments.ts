import type { SeedContext } from "./context";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** A time `days` ago at 09:00 UTC, so seeded sessions never collide with bookable slots. */
function daysAgo(days: number) {
  const d = new Date(Date.now() - days * DAY);
  d.setUTCHours(9, 0, 0, 0);
  return d;
}

/**
 * Demo data for the payments feature. Must be safe to run more than once.
 *
 * - Diego has (simulated) payouts set up; Maya hasn't, so her earnings show as held.
 * - Sam (client@) has paid Diego for sessions: one at the new-client fee, then
 *   repeat-client fees, one refunded in full and one refunded in part.
 * - Priya has paid Maya for one session.
 * All sessions are in the past so they don't block anyone's calendar.
 */
export async function seedPayments(ctx: SeedContext) {
  const { db } = ctx;
  const diego = ctx.trainers["diego@example.com"];
  const maya = ctx.trainers["maya@example.com"];
  const sam = ctx.clients["client@example.com"];
  const priya = ctx.clients["priya@example.com"];
  if (!diego || !maya || !sam || !priya) return;

  await db.trainerProfile.update({
    where: { id: diego.trainerId },
    data: { stripeAccountId: `acct_sim_${diego.trainerId}`, stripeChargesEnabled: true, stripePayoutsEnabled: true },
  });

  type SeedBooking = {
    id: string;
    trainerId: string;
    clientId: string;
    startsAt: Date;
    /** How long before the session the client paid. */
    paidDaysBefore: number;
    status: "COMPLETED" | "CANCELLED";
    priceCents: number;
    currency: string;
    platformFeeCents: number;
    refundedCents: number;
    cancelled?: { daysBefore: number; reason: string };
  };

  const bookings: SeedBooking[] = [
    {
      id: "seed-pay-diego-1",
      trainerId: diego.trainerId,
      clientId: sam.userId,
      startsAt: daysAgo(40),
      paidDaysBefore: 3,
      status: "COMPLETED",
      priceCents: 8000,
      currency: "usd",
      platformFeeCents: 1200, // 15%: Sam's first payment to Diego
      refundedCents: 0,
    },
    {
      id: "seed-pay-diego-2",
      trainerId: diego.trainerId,
      clientId: sam.userId,
      startsAt: daysAgo(26),
      paidDaysBefore: 5,
      status: "COMPLETED",
      priceCents: 8000,
      currency: "usd",
      platformFeeCents: 400, // 5% from then on
      refundedCents: 0,
    },
    {
      id: "seed-pay-diego-3",
      trainerId: diego.trainerId,
      clientId: sam.userId,
      startsAt: daysAgo(9),
      paidDaysBefore: 6,
      status: "CANCELLED",
      cancelled: { daysBefore: 3, reason: "Work trip came up" },
      priceCents: 8000,
      currency: "usd",
      platformFeeCents: 400,
      refundedCents: 8000, // cancelled in time: full refund, fee returned
    },
    {
      id: "seed-pay-diego-4",
      trainerId: diego.trainerId,
      clientId: sam.userId,
      startsAt: daysAgo(4),
      paidDaysBefore: 7,
      status: "CANCELLED",
      cancelled: { daysBefore: 0.25, reason: "Feeling unwell" },
      priceCents: 8000,
      currency: "usd",
      platformFeeCents: 400,
      refundedCents: 4000, // late cancellation: Diego refunded half as a goodwill gesture
    },
    {
      id: "seed-pay-maya-1",
      trainerId: maya.trainerId,
      clientId: priya.userId,
      startsAt: daysAgo(12),
      paidDaysBefore: 4,
      status: "COMPLETED",
      priceCents: 6500,
      currency: "gbp",
      platformFeeCents: 975, // 15%: Priya's first payment to Maya
      refundedCents: 0,
    },
  ];

  for (const { paidDaysBefore, cancelled, ...b } of bookings) {
    const endsAt = new Date(b.startsAt.getTime() + HOUR);
    await db.booking.upsert({
      where: { id: b.id },
      update: {},
      create: {
        ...b,
        endsAt,
        createdAt: new Date(b.startsAt.getTime() - paidDaysBefore * DAY),
        stripePaymentIntentId: `pi_sim_${b.id}`,
        location: "Seeded demo session",
        ...(b.status === "COMPLETED" && { completedAt: endsAt }),
        ...(cancelled && {
          cancelledAt: new Date(b.startsAt.getTime() - cancelled.daysBefore * DAY),
          cancelledById: b.clientId,
          cancellationReason: cancelled.reason,
        }),
      },
    });
  }
}
