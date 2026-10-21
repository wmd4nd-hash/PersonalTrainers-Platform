import type { PurchaseStatus } from "@/generated/prisma/enums";
import { PAYMENT_HOLD_MINUTES } from "./scheduling";

/** Limits for what a trainer can put in a package. */
export const PACKAGE_LIMITS = {
  minSessions: 2,
  maxSessions: 50,
  minValidDays: 7,
  maxValidDays: 365,
  /** 100,000.00 in the trainer's currency. */
  maxPriceCents: 10_000_000,
} as const;

/** What the same number of single sessions would cost. */
export function fullPriceCents(sessionCount: number, singleRateCents: number): number {
  return Math.max(0, sessionCount) * Math.max(0, singleRateCents);
}

/**
 * Whole percent saved by buying the package instead of single sessions,
 * rounded toward zero so a saving is never overstated. Negative when the
 * package costs more than single sessions would.
 */
export function savingsPercent(
  packagePriceCents: number,
  sessionCount: number,
  singleRateCents: number,
): number {
  const full = fullPriceCents(sessionCount, singleRateCents);
  if (full === 0) return 0;
  // Integer maths first so 10% comes out as exactly 10, not 9.999….
  return Math.trunc(((full - packagePriceCents) * 100) / full);
}

export type RefundablePurchase = {
  priceCents: number;
  refundedCents: number;
  sessionsTotal: number;
  sessionsUsed: number;
};

/** Sessions not yet used (or booked) from a purchase. */
export function unusedSessions(p: Pick<RefundablePurchase, "sessionsTotal" | "sessionsUsed">): number {
  return Math.min(p.sessionsTotal, Math.max(0, p.sessionsTotal - p.sessionsUsed));
}

/**
 * Refund owed for the unused sessions of a purchase: the unused share of the
 * price paid, less anything already refunded. Never negative and never more
 * than what is left of the payment.
 */
export function unusedRefundCents(p: RefundablePurchase): number {
  if (p.sessionsTotal <= 0 || p.priceCents <= 0) return 0;
  const share = Math.round((p.priceCents * unusedSessions(p)) / p.sessionsTotal);
  const stillPaid = Math.max(0, p.priceCents - p.refundedCents);
  return Math.min(stillPaid, Math.max(0, share - p.refundedCents));
}

export type PurchaseState =
  /** Paid, in date and with sessions left. */
  | "usable"
  /** Checkout started recently; payment may still arrive. */
  | "awaiting-payment"
  /** Checkout started too long ago to still be in progress. Hidden from clients. */
  | "abandoned"
  | "used-up"
  | "expired"
  | "cancelled";

export type PurchaseLike = {
  status: PurchaseStatus;
  sessionsTotal: number;
  sessionsUsed: number;
  expiresAt: Date;
  createdAt: Date;
};

/** True while an unpaid checkout could still complete. */
export function isPaymentHoldOpen(createdAt: Date, now: Date, holdMinutes = PAYMENT_HOLD_MINUTES): boolean {
  return now.getTime() - createdAt.getTime() < holdMinutes * 60_000;
}

/**
 * How a purchase should be treated right now. Works from the stored status but
 * also catches purchases whose expiry has passed before they were marked.
 */
export function purchaseState(p: PurchaseLike, now: Date): PurchaseState {
  switch (p.status) {
    case "PENDING_PAYMENT":
      return isPaymentHoldOpen(p.createdAt, now) ? "awaiting-payment" : "abandoned";
    case "CANCELLED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    case "EXHAUSTED":
      return "used-up";
    case "ACTIVE":
      if (p.expiresAt <= now) return "expired";
      if (p.sessionsUsed >= p.sessionsTotal) return "used-up";
      return "usable";
  }
}
