import "server-only";
import { connection } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

/** Platform numbers for the admin overview. Money is grouped by currency, never summed across. */

export type MoneyTotal = { currency: string; cents: number };

/** First instant of the current calendar month in UTC. */
export function startOfUtcMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Adds up per-currency amounts, drops zeros and puts the largest first. */
export function mergeMoneyTotals(...lists: MoneyTotal[][]): MoneyTotal[] {
  const totals = new Map<string, number>();
  for (const { currency, cents } of lists.flat()) {
    totals.set(currency, (totals.get(currency) ?? 0) + cents);
  }
  return [...totals]
    .map(([currency, cents]) => ({ currency, cents }))
    .filter((t) => t.cents !== 0)
    .sort((a, b) => b.cents - a.cents || a.currency.localeCompare(b.currency));
}

/**
 * Card-paid bookings: confirmed or completed, or cancelled after payment (a
 * refund or a Stripe payment exists). Package sessions are excluded because
 * the money was taken when the package was bought.
 */
export const paidCardBookingWhere: Prisma.BookingWhereInput = {
  packagePurchaseId: null,
  OR: [
    { status: { in: ["CONFIRMED", "COMPLETED"] } },
    { status: "CANCELLED", OR: [{ refundedCents: { gt: 0 } }, { stripePaymentIntentId: { not: null } }] },
  ],
};

export const paidPackageWhere: Prisma.PackagePurchaseWhereInput = {
  OR: [
    { status: { in: ["ACTIVE", "EXHAUSTED", "EXPIRED"] } },
    { status: "CANCELLED", OR: [{ refundedCents: { gt: 0 } }, { stripePaymentIntentId: { not: null } }] },
  ],
};

type Sums = { currency: string; _sum: Record<string, number | null> };

function totalsOf(rows: Sums[], field: string): MoneyTotal[] {
  return rows.map((r) => ({ currency: r.currency, cents: r._sum[field] ?? 0 }));
}

export async function getAdminOverview() {
  await connection();
  const now = new Date();
  const monthStart = startOfUtcMonth(now);
  const thisMonth = { gte: monthStart };

  const [
    clients,
    trainers,
    suspended,
    published,
    verified,
    pendingDocuments,
    bookingsThisMonth,
    bookingSums,
    packageSums,
    bookingRefunds,
    packageRefunds,
    recentSignups,
    recentBookings,
  ] = await Promise.all([
    db.user.count({ where: { role: "CLIENT" } }),
    db.user.count({ where: { role: "TRAINER" } }),
    db.user.groupBy({ by: ["role"], where: { suspendedAt: { not: null } }, _count: { _all: true } }),
    db.trainerProfile.count({ where: { published: true, user: { suspendedAt: null } } }),
    db.trainerProfile.count({ where: { verificationStatus: "VERIFIED" } }),
    db.verificationDocument.count({ where: { status: "PENDING" } }),
    // Package sessions are confirmed when booked, so every one of them counts.
    db.booking.count({
      where: { createdAt: thisMonth, OR: [{ packagePurchaseId: { not: null } }, paidCardBookingWhere] },
    }),
    db.booking.groupBy({
      by: ["currency"],
      where: { createdAt: thisMonth, ...paidCardBookingWhere },
      _sum: { priceCents: true, platformFeeCents: true },
    }),
    db.packagePurchase.groupBy({
      by: ["currency"],
      where: { createdAt: thisMonth, ...paidPackageWhere },
      _sum: { priceCents: true, platformFeeCents: true },
    }),
    db.booking.groupBy({
      by: ["currency"],
      where: { cancelledAt: thisMonth, refundedCents: { gt: 0 } },
      _sum: { refundedCents: true },
    }),
    // Purchases don't record when a refund happened; count refunds on this month's purchases.
    db.packagePurchase.groupBy({
      by: ["currency"],
      where: { createdAt: thisMonth, refundedCents: { gt: 0 } },
      _sum: { refundedCents: true },
    }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, name: true, email: true, role: true, avatarFileId: true, createdAt: true, suspendedAt: true },
    }),
    db.booking.findMany({
      where: { status: { not: "PENDING_PAYMENT" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        startsAt: true,
        status: true,
        priceCents: true,
        currency: true,
        packagePurchaseId: true,
        client: { select: { id: true, name: true } },
        trainer: { select: { timezone: true, user: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const suspendedWithRole = (role: string) => suspended.find((r) => r.role === role)?._count._all ?? 0;

  return {
    monthStart,
    counts: {
      clients,
      trainers,
      suspendedClients: suspendedWithRole("CLIENT"),
      suspendedTrainers: suspendedWithRole("TRAINER"),
      published,
      verified,
      pendingDocuments,
    },
    month: {
      bookings: bookingsThisMonth,
      gross: mergeMoneyTotals(totalsOf(bookingSums, "priceCents"), totalsOf(packageSums, "priceCents")),
      fees: mergeMoneyTotals(totalsOf(bookingSums, "platformFeeCents"), totalsOf(packageSums, "platformFeeCents")),
      refunds: mergeMoneyTotals(totalsOf(bookingRefunds, "refundedCents"), totalsOf(packageRefunds, "refundedCents")),
    },
    recentSignups,
    recentBookings,
  };
}

export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;
