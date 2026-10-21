import { addDays, addMinutes, subDays } from "date-fns";
import { perSessionCents, platformFeeCents } from "../../src/lib/fees";
import type { SeedContext } from "./context";

/** A 5-session pack at about 10% off and a 10-session pack at about 15% off. */
const PACKS = [
  { sessionCount: 5, discount: 0.1, validDays: 90, title: "5-session pack", description: "Five sessions to build a habit." },
  {
    sessionCount: 10,
    discount: 0.15,
    validDays: 180,
    title: "10-session pack",
    description: "Ten sessions for steady progress, at the best price per session.",
  },
] as const;

/** Rounded down to a whole unit of currency, so the saving is never less than advertised. */
function packPriceCents(sessionRateCents: number, sessionCount: number, discount: number) {
  return Math.floor((sessionRateCents * sessionCount * (1 - discount)) / 100) * 100;
}

/** Demo data for the packages feature. Must be safe to run more than once. */
export async function seedPackages(ctx: SeedContext) {
  const { db } = ctx;
  const packIds: Record<string, string> = {};

  for (const [email, { trainerId }] of Object.entries(ctx.trainers)) {
    const trainer = await db.trainerProfile.findUniqueOrThrow({
      where: { id: trainerId },
      select: { sessionRateCents: true },
    });
    for (const pack of PACKS) {
      const existing = await db.package.findFirst({ where: { trainerId, title: pack.title }, select: { id: true } });
      const { id } =
        existing ??
        (await db.package.create({
          data: {
            trainerId,
            title: pack.title,
            description: pack.description,
            sessionCount: pack.sessionCount,
            priceCents: packPriceCents(trainer.sessionRateCents, pack.sessionCount, pack.discount),
            validDays: pack.validDays,
          },
          select: { id: true },
        }));
      packIds[`${email}:${pack.sessionCount}`] = id;
    }
  }

  // client@example.com bought Maya's 5-pack three weeks ago and has used one session.
  const maya = ctx.trainers["maya@example.com"];
  const client = ctx.clients["client@example.com"];
  const packageId = packIds["maya@example.com:5"];
  if (!maya || !client || !packageId) return;

  const already = await db.packagePurchase.findFirst({
    where: { clientId: client.userId, packageId },
    select: { id: true },
  });
  if (already) return;

  const pkg = await db.package.findUniqueOrThrow({ where: { id: packageId } });
  const profile = await db.trainerProfile.findUniqueOrThrow({
    where: { id: maya.trainerId },
    select: { currency: true, sessionMinutes: true, defaultLocation: true },
  });
  const boughtAt = subDays(new Date(), 21);
  const purchase = await db.packagePurchase.create({
    data: {
      packageId,
      trainerId: maya.trainerId,
      clientId: client.userId,
      status: "ACTIVE",
      sessionsTotal: pkg.sessionCount,
      sessionsUsed: 1,
      priceCents: pkg.priceCents,
      currency: profile.currency,
      platformFeeCents: platformFeeCents(pkg.priceCents, { isNewClient: true }),
      expiresAt: addDays(boughtAt, pkg.validDays),
      createdAt: boughtAt,
    },
  });

  // The session that used it: a week ago at 08:00 UTC, already done.
  const startsAt = subDays(new Date(new Date().setUTCHours(8, 0, 0, 0)), 7);
  await db.booking.create({
    data: {
      trainerId: maya.trainerId,
      clientId: client.userId,
      startsAt,
      endsAt: addMinutes(startsAt, profile.sessionMinutes),
      status: "COMPLETED",
      completedAt: addMinutes(startsAt, profile.sessionMinutes),
      location: profile.defaultLocation,
      priceCents: perSessionCents(pkg.priceCents, pkg.sessionCount),
      currency: profile.currency,
      packagePurchaseId: purchase.id,
      createdAt: addDays(boughtAt, 1),
    },
  });
}
