import type { CurrentUser } from "@/lib/auth";

export type ReviewableBooking = { id: string; status: string; clientId: string };

/** "Leave a review" link on completed bookings. Implemented by the reviews feature. */
export async function BookingReviewAction({ booking, viewer }: { booking: ReviewableBooking; viewer: CurrentUser }) {
  void booking;
  void viewer;
  return null;
}
