import "server-only";
import type { BookingStatus, Prisma, PurchaseStatus } from "@/generated/prisma/client";
import { db } from "./db";
import {
  buildLedger,
  paymentStatus,
  type LedgerEntry,
  type PaymentKind,
  type PaymentRecord,
  type PaymentStatus,
} from "./earnings";
import { cardPaidBookingWhere, isSimulatedId, paidPackageWhere } from "./payments";
import { formatSlot } from "./scheduling";

/**
 * Loads card payments from the database for the earnings, payment history and
 * receipt pages. Callers pass the signed-in trainer's or client's id; every
 * query here is scoped to it.
 *
 * The schema has no paid-at or refunded-at columns, so: a payment is dated when
 * its booking or purchase was created (checkout closes within 31 minutes), and a
 * booking refund when the booking was cancelled.
 */

function sessionDescription(b: { startsAt: Date; endsAt: Date }, timezone: string) {
  const minutes = Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000);
  return `${minutes}-minute session, ${formatSlot(b.startsAt, timezone)}`;
}

function packageDescription(p: { sessionsTotal: number; package: { title: string } }) {
  return `${p.package.title} (${p.sessionsTotal} ${p.sessionsTotal === 1 ? "session" : "sessions"})`;
}

/** A trainer's card payments, refunds and delivered package sessions as statement lines. */
export async function loadTrainerLedger(trainerId: string, timezone: string, now: Date): Promise<LedgerEntry[]> {
  const [bookings, purchases, packageSessions] = await Promise.all([
    db.booking.findMany({
      where: { trainerId, ...cardPaidBookingWhere() },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        cancelledAt: true,
        priceCents: true,
        platformFeeCents: true,
        refundedCents: true,
        currency: true,
        client: { select: { name: true } },
      },
    }),
    db.packagePurchase.findMany({
      where: { trainerId, ...paidPackageWhere() },
      select: {
        id: true,
        createdAt: true,
        priceCents: true,
        platformFeeCents: true,
        refundedCents: true,
        currency: true,
        sessionsTotal: true,
        package: { select: { title: true } },
        client: { select: { name: true } },
      },
    }),
    // Sessions paid with a package credit that have taken place.
    db.booking.findMany({
      where: {
        trainerId,
        packagePurchaseId: { not: null },
        OR: [{ status: "COMPLETED" }, { status: "CONFIRMED", endsAt: { lte: now } }],
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        completedAt: true,
        priceCents: true,
        currency: true,
        client: { select: { name: true } },
        packagePurchase: { select: { package: { select: { title: true } } } },
      },
    }),
  ]);

  const payments: PaymentRecord[] = [
    ...bookings.map((b) => ({
      kind: "booking" as const,
      id: b.id,
      paidAt: b.createdAt,
      refundedAt: b.refundedCents > 0 ? b.cancelledAt : null,
      currency: b.currency,
      amountCents: b.priceCents,
      platformFeeCents: b.platformFeeCents,
      refundedCents: b.refundedCents,
      clientName: b.client.name,
      description: sessionDescription(b, timezone),
    })),
    ...purchases.map((p) => ({
      kind: "package" as const,
      id: p.id,
      paidAt: p.createdAt,
      refundedAt: null,
      currency: p.currency,
      amountCents: p.priceCents,
      platformFeeCents: p.platformFeeCents,
      refundedCents: p.refundedCents,
      clientName: p.client.name,
      description: packageDescription(p),
    })),
  ];

  return buildLedger(
    payments,
    packageSessions.map((s) => ({
      id: s.id,
      deliveredAt: s.completedAt ?? s.endsAt,
      currency: s.currency,
      valueCents: s.priceCents,
      clientName: s.client.name,
      description: `${sessionDescription(s, timezone)} · ${s.packagePurchase?.package.title ?? "Package"}`,
    })),
  );
}

/** One card payment as the client sees it. */
export type ClientPayment = {
  kind: PaymentKind;
  id: string;
  paidAt: Date;
  /** Timezone the session and dates are shown in (the trainer's). */
  timezone: string;
  title: string;
  detail: string;
  trainerId: string;
  trainerName: string;
  currency: string;
  amountCents: number;
  refundedCents: number;
  status: PaymentStatus;
  /** What happened to the booking or package since. */
  itemStatus: BookingStatus | PurchaseStatus;
  /** Paid while Stripe was not configured: no real money moved. */
  simulated: boolean;
};

const bookingSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  status: true,
  priceCents: true,
  refundedCents: true,
  currency: true,
  stripePaymentIntentId: true,
  trainer: { select: { id: true, timezone: true, user: { select: { name: true } } } },
} satisfies Prisma.BookingSelect;

const purchaseSelect = {
  id: true,
  createdAt: true,
  status: true,
  priceCents: true,
  refundedCents: true,
  currency: true,
  sessionsTotal: true,
  stripePaymentIntentId: true,
  package: { select: { title: true } },
  trainer: { select: { id: true, timezone: true, user: { select: { name: true } } } },
} satisfies Prisma.PackagePurchaseSelect;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;
type PurchaseRow = Prisma.PackagePurchaseGetPayload<{ select: typeof purchaseSelect }>;

function fromBooking(b: BookingRow): ClientPayment {
  return {
    kind: "booking",
    id: b.id,
    paidAt: b.createdAt,
    timezone: b.trainer.timezone,
    title: `Session with ${b.trainer.user.name}`,
    detail: sessionDescription(b, b.trainer.timezone),
    trainerId: b.trainer.id,
    trainerName: b.trainer.user.name,
    currency: b.currency,
    amountCents: b.priceCents,
    refundedCents: b.refundedCents,
    status: paymentStatus({ amountCents: b.priceCents, refundedCents: b.refundedCents }),
    itemStatus: b.status,
    simulated: b.stripePaymentIntentId ? isSimulatedId(b.stripePaymentIntentId) : true,
  };
}

function fromPurchase(p: PurchaseRow): ClientPayment {
  return {
    kind: "package",
    id: p.id,
    paidAt: p.createdAt,
    timezone: p.trainer.timezone,
    title: `${p.package.title} with ${p.trainer.user.name}`,
    detail: `Package of ${p.sessionsTotal} ${p.sessionsTotal === 1 ? "session" : "sessions"}`,
    trainerId: p.trainer.id,
    trainerName: p.trainer.user.name,
    currency: p.currency,
    amountCents: p.priceCents,
    refundedCents: p.refundedCents,
    status: paymentStatus({ amountCents: p.priceCents, refundedCents: p.refundedCents }),
    itemStatus: p.status,
    simulated: p.stripePaymentIntentId ? isSimulatedId(p.stripePaymentIntentId) : true,
  };
}

/** Every card payment the client has made, newest first. */
export async function loadClientPayments(clientId: string): Promise<ClientPayment[]> {
  const [bookings, purchases] = await Promise.all([
    db.booking.findMany({ where: { clientId, ...cardPaidBookingWhere() }, select: bookingSelect }),
    db.packagePurchase.findMany({ where: { clientId, ...paidPackageWhere() }, select: purchaseSelect }),
  ]);
  return [...bookings.map(fromBooking), ...purchases.map(fromPurchase)].sort(
    (a, b) => b.paidAt.getTime() - a.paidAt.getTime(),
  );
}

/** One of the client's card payments, or null if it isn't theirs or wasn't paid by card. */
export async function loadClientPayment(clientId: string, kind: string, id: string): Promise<ClientPayment | null> {
  if (kind === "booking") {
    const b = await db.booking.findFirst({ where: { id, clientId, ...cardPaidBookingWhere() }, select: bookingSelect });
    return b && fromBooking(b);
  }
  if (kind === "package") {
    const p = await db.packagePurchase.findFirst({ where: { id, clientId, ...paidPackageWhere() }, select: purchaseSelect });
    return p && fromPurchase(p);
  }
  return null;
}
