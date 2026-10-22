import Link from "next/link";
import { connection } from "next/server";
import { cache } from "react";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { reviewEligibility } from "@/lib/reviews";

export type ReviewableBooking = { id: string; status: string; clientId: string };

/**
 * The client's completed bookings and their reviews, loaded once per request so
 * a long booking list doesn't run one query per row.
 */
const completedBookingsOf = cache(async (clientId: string) => {
  const bookings = await db.booking.findMany({
    where: { clientId, status: "COMPLETED" },
    select: { id: true, clientId: true, status: true, endsAt: true, review: { select: { rating: true } } },
  });
  return new Map(bookings.map((b) => [b.id, b]));
});

/** "Leave a review" on a client's completed booking, or the rating they gave. */
export async function BookingReviewAction({ booking, viewer }: { booking: ReviewableBooking; viewer: CurrentUser }) {
  if (viewer.role !== "CLIENT" || booking.clientId !== viewer.id || booking.status !== "COMPLETED") return null;

  // Re-read from the database rather than trusting the row we were handed.
  const own = (await completedBookingsOf(viewer.id)).get(booking.id);
  if (!own) return null;

  if (own.review) {
    return (
      <Link href={`/dashboard/reviews/new/${own.id}`} className="self-center text-sm text-subtle hover:underline">
        <span aria-hidden="true">
          You rated it {own.review.rating}
          <span className="text-amber-500">★</span>
        </span>
        <span className="sr-only">You rated it {own.review.rating} out of 5 stars</span>
      </Link>
    );
  }

  await connection();
  const check = reviewEligibility({ ...own, hasReview: false }, viewer.id, new Date());
  if (!check.eligible) return null;

  return (
    <Link
      href={`/dashboard/reviews/new/${own.id}`}
      className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
    >
      Leave a review
    </Link>
  );
}
