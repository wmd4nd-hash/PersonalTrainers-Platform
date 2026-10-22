import { addDays } from "date-fns";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Review rules. Everything here except `recomputeTrainerRating` is pure, so it
 * can be unit-tested and shared by pages, actions and seeds.
 */

/** Clients can review a completed session for this many days after it ends. */
export const REVIEW_WINDOW_DAYS = 60;
export const MAX_COMMENT_LENGTH = 1000;
export const MAX_REPLY_LENGTH = 1000;
/** Ratings from best to worst, the order distribution bars are shown in. */
export const RATINGS = [5, 4, 3, 2, 1] as const;

export type ReviewCandidate = {
  clientId: string;
  status: string;
  endsAt: Date;
  hasReview: boolean;
};

export type IneligibleReason = "not-your-booking" | "already-reviewed" | "not-completed" | "window-closed";

export type ReviewEligibility =
  | { eligible: true; deadline: Date }
  | { eligible: false; reason: IneligibleReason; deadline: Date };

/** Last moment a client can review a session that ended at `endsAt`. */
export function reviewDeadline(endsAt: Date): Date {
  return addDays(endsAt, REVIEW_WINDOW_DAYS);
}

/**
 * Only the client of a completed booking can review it, once, within
 * REVIEW_WINDOW_DAYS of the session.
 */
export function reviewEligibility(booking: ReviewCandidate, viewerId: string, now: Date): ReviewEligibility {
  const deadline = reviewDeadline(booking.endsAt);
  const reason: IneligibleReason | null =
    booking.clientId !== viewerId
      ? "not-your-booking"
      : booking.hasReview
        ? "already-reviewed"
        : booking.status !== "COMPLETED"
          ? "not-completed"
          : now > deadline
            ? "window-closed"
            : null;
  return reason ? { eligible: false, reason, deadline } : { eligible: true, deadline };
}

export function isValidRating(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

const ratingLabels: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very good",
  5: "Excellent",
};

/** Plain-words label for a star rating, e.g. 4 → "Very good". */
export function ratingLabel(rating: number): string {
  return ratingLabels[rating] ?? "";
}

/** Average rounded to two decimals; 0 when there are no ratings. */
export function averageRating(sum: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((sum / count) * 100) / 100;
}

export type RatingSummaryData = {
  average: number;
  count: number;
  /** One row per star value, 5 first, including values nobody gave. */
  distribution: { rating: number; count: number; percent: number }[];
};

/** Builds the average and 5-to-1 distribution from per-rating counts (e.g. a groupBy). */
export function summarizeRatings(groups: { rating: number; count: number }[]): RatingSummaryData {
  const byRating = new Map<number, number>();
  for (const g of groups) {
    if (!isValidRating(g.rating) || g.count <= 0) continue;
    byRating.set(g.rating, (byRating.get(g.rating) ?? 0) + g.count);
  }
  let count = 0;
  let sum = 0;
  for (const [rating, n] of byRating) {
    count += n;
    sum += rating * n;
  }
  return {
    average: averageRating(sum, count),
    count,
    distribution: RATINGS.map((rating) => {
      const n = byRating.get(rating) ?? 0;
      return { rating, count: n, percent: count ? Math.round((n / count) * 100) : 0 };
    }),
  };
}

/** "1 review", "7 reviews". */
export function reviewCountLabel(count: number): string {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
}

/** Calendar date for a review, e.g. "Oct 12, 2026", in the given timezone. */
export function formatReviewDate(date: Date, timezone = "UTC", locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Public reviewer name: first name and last initial, e.g. "Priya Shah" → "Priya S." */
export function reviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : "";
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}

/** Reads a 1-based page number from a search param, defaulting to 1. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export type Pagination = {
  page: number;
  pageCount: number;
  skip: number;
  take: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

/** Clamps the requested page to the available range and works out skip/take. */
export function paginate(total: number, requestedPage: number, perPage: number): Pagination {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);
  return {
    page,
    pageCount,
    skip: (page - 1) * perPage,
    take: perPage,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}

/**
 * Recomputes a trainer's denormalised rating from their visible reviews.
 * Call inside the same transaction as the review change. The row lock makes
 * concurrent changes for one trainer queue up, so the last writer always sees
 * every committed review and the totals can't drift.
 */
export async function recomputeTrainerRating(tx: Prisma.TransactionClient, trainerId: string) {
  // NO KEY UPDATE doesn't conflict with the KEY SHARE lock a Review insert takes on its trainer.
  await tx.$queryRaw`SELECT 1 FROM "TrainerProfile" WHERE "id" = ${trainerId} FOR NO KEY UPDATE`;
  const totals = await tx.review.aggregate({
    where: { trainerId, hidden: false },
    _sum: { rating: true },
    _count: { _all: true },
  });
  const ratingCount = totals._count._all;
  const ratingAverage = averageRating(totals._sum.rating ?? 0, ratingCount);
  await tx.trainerProfile.update({
    where: { id: trainerId },
    data: { ratingAverage, ratingCount },
  });
  return { ratingAverage, ratingCount };
}
