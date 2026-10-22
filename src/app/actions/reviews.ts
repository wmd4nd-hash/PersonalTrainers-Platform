"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin, requireRole, requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import { reviewPosted } from "@/lib/events";
import { recomputeTrainerRating, reviewEligibility, type IneligibleReason } from "@/lib/reviews";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";
import { replySchema, reviewSchema } from "@/lib/validation/reviews";

class NotEligibleError extends Error {
  constructor(readonly reason: IneligibleReason | "not-found") {
    super(reason);
  }
}

const ineligibleMessages: Record<IneligibleReason | "not-found", string> = {
  "not-found": "We couldn't find that session.",
  "not-your-booking": "We couldn't find that session.",
  "already-reviewed": "You've already reviewed this session.",
  "not-completed": "You can review this session once it's marked as completed.",
  "window-closed": "The time to review this session has passed.",
};

/** Client posts a review for one of their completed sessions. */
export async function createReview(bookingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const client = await requireRole("CLIENT");
  const parsed = reviewSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { rating, comment } = parsed.data;

  let reviewId: string;
  try {
    reviewId = await db.$transaction(async (tx) => {
      // Scoped to the signed-in client: another client's booking id looks like a missing one.
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, clientId: client.id },
        select: { id: true, clientId: true, trainerId: true, status: true, endsAt: true, review: { select: { id: true } } },
      });
      if (!booking) throw new NotEligibleError("not-found");
      const check = reviewEligibility({ ...booking, hasReview: Boolean(booking.review) }, client.id, new Date());
      if (!check.eligible) throw new NotEligibleError(check.reason);

      const review = await tx.review.create({
        data: { bookingId: booking.id, trainerId: booking.trainerId, clientId: client.id, rating, comment },
        select: { id: true },
      });
      await recomputeTrainerRating(tx, booking.trainerId);
      return review.id;
    });
  } catch (err) {
    if (err instanceof NotEligibleError) return { error: ineligibleMessages[err.reason] };
    // Two submits at once: the unique booking id lets only one through.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: ineligibleMessages["already-reviewed"] };
    }
    throw err;
  }

  // Tell the trainer without holding up the client's redirect.
  after(() => reviewPosted(reviewId));
  redirect(`/dashboard/reviews/new/${bookingId}?posted=1`);
}

/** Trainer adds or edits their single public reply to a review of their own. */
export async function saveReviewReply(reviewId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();
  const parsed = replySchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  const { count } = await db.review.updateMany({
    where: { id: reviewId, trainerId, hidden: false },
    data: { trainerReply: parsed.data.reply, repliedAt: new Date() },
  });
  if (count === 0) return { error: "This review can't be replied to." };
  refresh();
  return { ok: true };
}

/** Trainer removes their reply. */
export async function deleteReviewReply(reviewId: string) {
  const trainerId = await requireTrainerProfileId();
  await db.review.updateMany({
    where: { id: reviewId, trainerId },
    data: { trainerReply: "", repliedAt: null },
  });
  refresh();
}

/** Admin hides or restores a review; the trainer's rating is recomputed either way. */
export async function setReviewHidden(reviewId: string, hidden: boolean) {
  await requireAdmin();
  if (typeof reviewId !== "string" || typeof hidden !== "boolean") return;

  await db.$transaction(async (tx) => {
    const review = await tx.review.findUnique({ where: { id: reviewId }, select: { trainerId: true } });
    if (!review) return;
    await tx.review.update({ where: { id: reviewId }, data: { hidden } });
    await recomputeTrainerRating(tx, review.trainerId);
  });
  refresh();
}
