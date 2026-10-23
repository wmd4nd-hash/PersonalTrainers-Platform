import { addMinutes, subDays } from "date-fns";
import { platformFeeCents } from "../../src/lib/fees";
import { addDaysToKey, dateKey, weekdayOfKey, zonedTime } from "../../src/lib/scheduling";
import { meetingUrlFor } from "../../src/lib/sessions";
import type { SeedContext } from "./context";

/** The first Monday-to-Friday date `fromDays` or more days after today in `timezone`. */
function weekdayFrom(now: Date, timezone: string, fromDays: number) {
  let key = addDaysToKey(dateKey(now, timezone), fromDays);
  while (weekdayOfKey(key) === 0 || weekdayOfKey(key) === 6) key = addDaysToKey(key, fromDays < 0 ? -1 : 1);
  return key;
}

/**
 * Demo data for the scheduling feature: a past and an upcoming session between
 * Tom and Omar, and a day of time off for Omar, so the calendar and overview
 * have something to show. Kept to one trainer/client pair so other features'
 * demo flows (and first-booking fees) aren't affected. Safe to run more than once.
 */
export async function seedScheduling(ctx: SeedContext) {
  const { db } = ctx;
  const omar = ctx.trainers["omar@example.com"];
  const tom = ctx.clients["tom@example.com"];
  if (!omar || !tom) return;

  const trainer = await db.trainerProfile.findUniqueOrThrow({ where: { id: omar.trainerId } });
  const { timezone, sessionMinutes, sessionRateCents: priceCents, currency } = trainer;
  const now = new Date();

  const alreadySeeded = await db.booking.count({ where: { trainerId: trainer.id, clientId: tom.userId } });
  if (alreadySeeded === 0) {
    // Last week, 17:00 trainer time: done and paid by card, as a new client.
    const pastStart = zonedTime(weekdayFrom(now, timezone, -7), 17 * 60, timezone);
    await db.booking.create({
      data: {
        trainerId: trainer.id,
        clientId: tom.userId,
        startsAt: pastStart,
        endsAt: addMinutes(pastStart, sessionMinutes),
        status: "COMPLETED",
        completedAt: addMinutes(pastStart, sessionMinutes),
        format: "IN_PERSON",
        location: trainer.defaultLocation,
        priceCents,
        currency,
        platformFeeCents: platformFeeCents(priceCents, { isNewClient: true }),
        notes: "First session: want to work on footwork and stamina.",
      },
    });

    // In a few days, 08:00 trainer time (inside the seeded weekday hours).
    const nextStart = zonedTime(weekdayFrom(now, timezone, 3), 8 * 60, timezone);
    await db.booking.create({
      data: {
        trainerId: trainer.id,
        clientId: tom.userId,
        startsAt: nextStart,
        endsAt: addMinutes(nextStart, sessionMinutes),
        status: "CONFIRMED",
        format: "IN_PERSON",
        location: trainer.defaultLocation,
        priceCents,
        currency,
        platformFeeCents: platformFeeCents(priceCents, { isNewClient: false }),
      },
    });
  }

  const hasTimeOff = await db.timeOff.count({ where: { trainerId: trainer.id, endsAt: { gt: now } } });
  if (hasTimeOff === 0) {
    const day = weekdayFrom(now, timezone, 10);
    await db.timeOff.create({
      data: {
        trainerId: trainer.id,
        startsAt: zonedTime(day, 0, timezone),
        endsAt: zonedTime(day, 24 * 60, timezone),
        reason: "Visiting family",
      },
    });
  }
}

/**
 * Upcoming sessions with Maya for Sam (client@) and Priya, so the accounts the
 * demo login page offers have something coming up on their overview and
 * calendar. Both have paid Maya before, so these are at the repeat-client fee:
 * run this after the other feature seeds. Safe to run more than once.
 */
export async function seedUpcomingSessions(ctx: SeedContext) {
  const { db } = ctx;
  const maya = ctx.trainers["maya@example.com"];
  const sam = ctx.clients["client@example.com"];
  const priya = ctx.clients["priya@example.com"];
  if (!maya || !sam || !priya) return;

  const trainer = await db.trainerProfile.findUniqueOrThrow({ where: { id: maya.trainerId } });
  const { timezone, sessionMinutes, sessionRateCents: priceCents, currency } = trainer;
  const now = new Date();

  // Inside Maya's seeded weekday hours (07:00–12:00 and 16:00–19:00).
  const sessions = [
    { id: "seed-upcoming-sam-maya", clientId: sam.userId, fromDays: 2, minute: 7 * 60, online: false, notes: "Can we check my deadlift form?" },
    { id: "seed-upcoming-priya-maya", clientId: priya.userId, fromDays: 4, minute: 17 * 60, online: true, notes: "" },
  ];
  for (const s of sessions) {
    const startsAt = zonedTime(weekdayFrom(now, timezone, s.fromDays), s.minute, timezone);
    await db.booking.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        trainerId: trainer.id,
        clientId: s.clientId,
        startsAt,
        endsAt: addMinutes(startsAt, sessionMinutes),
        status: "CONFIRMED",
        format: s.online ? "ONLINE" : "IN_PERSON",
        location: s.online ? "" : trainer.defaultLocation,
        meetingUrl: s.online ? meetingUrlFor(trainer, s.id) : null,
        priceCents,
        currency,
        platformFeeCents: platformFeeCents(priceCents, { isNewClient: false }),
        stripePaymentIntentId: `pi_sim_${s.id}`,
        notes: s.notes,
        createdAt: subDays(now, 1),
      },
    });
  }
}
