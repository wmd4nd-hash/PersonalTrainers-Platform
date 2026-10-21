"use server";

import { addDays } from "date-fns";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireRole, requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import { unusedRefundCents, unusedSessions } from "@/lib/package-pricing";
import { notifyPackageRefunded } from "@/lib/packages";
import { beginPackageCheckout, refundPackage } from "@/lib/payments";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";
import { packageSchema, type PackageInput } from "@/lib/validation/packages";

function packageData({ title, description, sessionCount, price, validDays }: PackageInput) {
  return { title, description, sessionCount, priceCents: price, validDays };
}

export async function createPackage(_prev: FormState, formData: FormData): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();
  const parsed = packageSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  await db.package.create({ data: { ...packageData(parsed.data), trainerId } });
  refresh();
  return { ok: true };
}

export async function updatePackage(
  packageId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();
  const parsed = packageSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  // Purchases keep their own copy of sessions, price and expiry, so edits only
  // affect people who buy from now on.
  const { count } = await db.package.updateMany({
    where: { id: packageId, trainerId },
    data: packageData(parsed.data),
  });
  if (count === 0) return { error: "We couldn't find that package." };
  refresh();
  return { ok: true };
}

async function setPackageActive(packageId: string, active: boolean) {
  const trainerId = await requireTrainerProfileId();
  await db.package.updateMany({ where: { id: packageId, trainerId }, data: { active } });
  refresh();
}

/** Takes a package off sale. People who already bought it keep their sessions. */
export async function deactivatePackage(packageId: string) {
  await setPackageActive(packageId, false);
}

export async function reactivatePackage(packageId: string) {
  await setPackageActive(packageId, true);
}

/** Starts buying a package: records an unpaid purchase and sends the client to checkout. */
export async function buyPackage(_prev: FormState, formData: FormData): Promise<FormState> {
  const client = await requireRole("CLIENT");
  const packageId = String(formData.get("packageId") ?? "");

  const pkg = await db.package.findFirst({
    where: {
      id: packageId,
      active: true,
      trainer: { published: true, user: { suspendedAt: null } },
    },
    include: { trainer: { select: { currency: true } } },
  });
  if (!pkg) return { error: "This package is no longer available." };

  const purchase = await db.packagePurchase.create({
    data: {
      packageId: pkg.id,
      trainerId: pkg.trainerId,
      clientId: client.id,
      status: "PENDING_PAYMENT",
      sessionsTotal: pkg.sessionCount,
      priceCents: pkg.priceCents,
      currency: pkg.trainer.currency,
      expiresAt: addDays(new Date(), pkg.validDays),
    },
    select: { id: true },
  });

  let checkoutUrl: string;
  try {
    checkoutUrl = await beginPackageCheckout(purchase.id);
  } catch (err) {
    console.error("Package checkout failed", err);
    await db.packagePurchase.updateMany({
      where: { id: purchase.id, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED" },
    });
    return { error: "We couldn't start the payment. Nothing has been charged, please try again." };
  }
  redirect(checkoutUrl);
}

class RefundRefused extends Error {}

/**
 * Trainer cancels a client's package and refunds the unused sessions pro rata.
 * Sessions already booked must be cancelled (or have happened) first, so a
 * refunded session can never also be attended.
 */
export async function refundUnusedSessions(purchaseId: string, _prev: FormState): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();
  const now = new Date();

  let claimed: { amountCents: number; sessions: number; previousStatus: "ACTIVE" | "EXPIRED"; refundedCents: number };
  try {
    claimed = await db.$transaction(
      async (tx) => {
        const purchase = await tx.packagePurchase.findFirst({
          where: { id: purchaseId, trainerId, status: { in: ["ACTIVE", "EXPIRED"] } },
        });
        if (!purchase) throw new RefundRefused("This package can't be refunded any more.");
        const previousStatus = purchase.status as "ACTIVE" | "EXPIRED";

        const upcoming = await tx.booking.count({
          where: {
            packagePurchaseId: purchase.id,
            status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
            endsAt: { gt: now },
          },
        });
        if (upcoming > 0) {
          throw new RefundRefused(
            `There ${upcoming === 1 ? "is 1 upcoming session" : `are ${upcoming} upcoming sessions`} booked with this package. Cancel ${upcoming === 1 ? "it" : "them"} first, then refund the rest.`,
          );
        }

        const amountCents = unusedRefundCents(purchase);
        if (amountCents <= 0) throw new RefundRefused("There's nothing left to refund on this package.");

        // Claim the purchase. Fails if a booking or another refund changed it meanwhile.
        const { count } = await tx.packagePurchase.updateMany({
          where: {
            id: purchase.id,
            status: previousStatus,
            sessionsUsed: purchase.sessionsUsed,
            refundedCents: purchase.refundedCents,
          },
          data: { status: "CANCELLED" },
        });
        if (count === 0) throw new RefundRefused("This package just changed. Please try again.");
        return {
          amountCents,
          sessions: unusedSessions(purchase),
          previousStatus,
          refundedCents: purchase.refundedCents,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof RefundRefused) return { error: err.message };
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return { error: "This package just changed. Please try again." };
    }
    throw err;
  }

  try {
    await refundPackage(purchaseId, claimed.amountCents);
  } catch (err) {
    console.error("Package refund failed", err);
    // Put the purchase back so the client keeps their sessions and the trainer can retry.
    await db.packagePurchase.updateMany({
      where: { id: purchaseId, status: "CANCELLED", refundedCents: claimed.refundedCents },
      data: { status: claimed.previousStatus },
    });
    return { error: "The refund didn't go through, so nothing has changed. Please try again." };
  }

  try {
    await notifyPackageRefunded(purchaseId, { amountCents: claimed.amountCents, sessions: claimed.sessions });
  } catch (err) {
    // The money has moved; a failed notification shouldn't look like a failed refund.
    console.error("Package refund notification failed", err);
  }
  refresh();
  return { ok: true };
}
