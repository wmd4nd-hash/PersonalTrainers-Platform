import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { perSessionCents } from "./fees";
import { formatMoney } from "./money";
import { notify } from "./notify";

type Tx = Prisma.TransactionClient;

export type UsableCredit = {
  purchaseId: string;
  title: string;
  remaining: number;
  expiresAt: Date;
};

/**
 * Active, unexpired package purchases with sessions left that the client can
 * book this trainer with. Soonest to expire first, so it is the default choice.
 */
export async function getUsableCredits(
  clientId: string,
  trainerId: string,
  now = new Date(),
): Promise<UsableCredit[]> {
  const purchases = await db.packagePurchase.findMany({
    where: { clientId, trainerId, status: "ACTIVE", expiresAt: { gt: now } },
    include: { package: { select: { title: true } } },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
  });
  return purchases
    .filter((p) => p.sessionsUsed < p.sessionsTotal)
    .map((p) => ({
      purchaseId: p.id,
      title: p.package.title,
      remaining: p.sessionsTotal - p.sessionsUsed,
      expiresAt: p.expiresAt,
    }));
}

export class CreditUnavailableError extends Error {
  constructor(message = "This package can't be used for this booking") {
    super(message);
    this.name = "CreditUnavailableError";
  }
}

/**
 * Uses one session from a purchase. Call inside the booking transaction.
 * Pass `startsAt` to also require the session to start before the package
 * expires. Throws CreditUnavailableError if the purchase can't be used,
 * including when another booking took the last session at the same moment.
 */
export async function consumeCredit(
  tx: Tx,
  {
    purchaseId,
    clientId,
    trainerId,
    now,
    startsAt,
  }: { purchaseId: string; clientId: string; trainerId: string; now: Date; startsAt?: Date },
) {
  const purchase = await tx.packagePurchase.findFirst({
    where: { id: purchaseId, clientId, trainerId, status: "ACTIVE", expiresAt: { gt: now } },
  });
  if (!purchase || purchase.sessionsUsed >= purchase.sessionsTotal) {
    throw new CreditUnavailableError();
  }
  if (startsAt && startsAt >= purchase.expiresAt) {
    throw new CreditUnavailableError("This package expires before that session");
  }
  const used = purchase.sessionsUsed + 1;
  // Only succeeds if nobody else changed the purchase since we read it, so two
  // bookings can't both take the last session.
  const { count } = await tx.packagePurchase.updateMany({
    where: { id: purchase.id, status: "ACTIVE", sessionsUsed: purchase.sessionsUsed },
    data: { sessionsUsed: used, ...(used >= purchase.sessionsTotal && { status: "EXHAUSTED" }) },
  });
  if (count === 0) throw new CreditUnavailableError();
  return {
    perSessionCents: perSessionCents(purchase.priceCents, purchase.sessionsTotal),
    currency: purchase.currency,
  };
}

/**
 * Gives a session back (e.g. after an on-time cancellation). Call inside the
 * cancellation transaction. Cancelled or unpaid purchases are left alone. A
 * used-up purchase becomes active again, or expired if its date has passed.
 */
export async function restoreCredit(tx: Tx, purchaseId: string, now = new Date()) {
  const purchase = await tx.packagePurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase || purchase.sessionsUsed <= 0) return;
  if (purchase.status === "CANCELLED" || purchase.status === "PENDING_PAYMENT") return;

  // Depends only on the expiry date, so concurrent restores agree on it.
  const status = purchase.status === "EXPIRED" || purchase.expiresAt <= now ? "EXPIRED" : "ACTIVE";
  // Atomic decrement: two cancellations at once must both give their session back.
  await tx.packagePurchase.updateMany({
    where: { id: purchase.id, sessionsUsed: { gt: 0 }, status: { in: ["ACTIVE", "EXHAUSTED", "EXPIRED"] } },
    data: { sessionsUsed: { decrement: 1 }, status },
  });
}

/**
 * Marks active purchases whose validity has run out as EXPIRED. Optionally
 * limited to one client's or one trainer's purchases. Returns how many changed.
 */
export async function expirePurchases(
  now: Date,
  scope: { clientId?: string; trainerId?: string } = {},
): Promise<number> {
  const { count } = await db.packagePurchase.updateMany({
    where: { ...scope, status: "ACTIVE", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  return count;
}

/** Tells the client their unused sessions were refunded. */
export async function notifyPackageRefunded(
  purchaseId: string,
  { amountCents, sessions }: { amountCents: number; sessions: number },
) {
  const p = await db.packagePurchase.findUnique({
    where: { id: purchaseId },
    include: { package: { select: { title: true } }, trainer: { include: { user: { select: { name: true } } } } },
  });
  if (!p) return;
  const amount = formatMoney(amountCents, p.currency);
  await notify({
    userId: p.clientId,
    type: "package.refunded",
    title: `${p.trainer.user.name} refunded your ${p.package.title}`,
    body: `${amount} for ${sessions} unused ${sessions === 1 ? "session" : "sessions"} is on its way back to you.`,
    link: "/dashboard/packages",
    email: true,
  });
}
