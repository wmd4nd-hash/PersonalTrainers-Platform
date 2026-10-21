import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { perSessionCents } from "./fees";

type Tx = Prisma.TransactionClient;

export type UsableCredit = {
  purchaseId: string;
  title: string;
  remaining: number;
  expiresAt: Date;
};

/** Active, unexpired package purchases the client can book this trainer with. */
export async function getUsableCredits(
  clientId: string,
  trainerId: string,
  now = new Date(),
): Promise<UsableCredit[]> {
  const purchases = await db.packagePurchase.findMany({
    where: { clientId, trainerId, status: "ACTIVE", expiresAt: { gt: now } },
    include: { package: { select: { title: true } } },
    orderBy: { expiresAt: "asc" },
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

export class CreditUnavailableError extends Error {}

/**
 * Uses one session from a purchase. Call inside the booking transaction.
 * Throws CreditUnavailableError if the purchase can't be used.
 */
export async function consumeCredit(
  tx: Tx,
  { purchaseId, clientId, trainerId, now }: { purchaseId: string; clientId: string; trainerId: string; now: Date },
) {
  const purchase = await tx.packagePurchase.findFirst({
    where: { id: purchaseId, clientId, trainerId, status: "ACTIVE", expiresAt: { gt: now } },
  });
  if (!purchase || purchase.sessionsUsed >= purchase.sessionsTotal) {
    throw new CreditUnavailableError();
  }
  const used = purchase.sessionsUsed + 1;
  await tx.packagePurchase.update({
    where: { id: purchase.id },
    data: { sessionsUsed: used, ...(used >= purchase.sessionsTotal && { status: "EXHAUSTED" }) },
  });
  return {
    perSessionCents: perSessionCents(purchase.priceCents, purchase.sessionsTotal),
    currency: purchase.currency,
  };
}

/** Gives a session back (e.g. after an on-time cancellation). */
export async function restoreCredit(tx: Tx, purchaseId: string, now = new Date()) {
  const purchase = await tx.packagePurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase || purchase.sessionsUsed === 0) return;
  const reactivate = purchase.status === "EXHAUSTED" && purchase.expiresAt > now;
  await tx.packagePurchase.update({
    where: { id: purchaseId },
    data: { sessionsUsed: { decrement: 1 }, ...(reactivate && { status: "ACTIVE" }) },
  });
}
