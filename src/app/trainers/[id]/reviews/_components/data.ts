import "server-only";
import { db } from "@/lib/db";
import { summarizeRatings } from "@/lib/reviews";
import type { Prisma } from "@/generated/prisma/client";

/** What the public sees of a review: never the client's full name or email. */
export const publicReviewSelect = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  trainerReply: true,
  repliedAt: true,
  client: { select: { name: true } },
} satisfies Prisma.ReviewSelect;

/** Newest first, with a tie-breaker so pages don't shuffle. */
export const newestFirst = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.ReviewOrderByWithRelationInput[];

/** Average, count and distribution from a trainer's visible reviews. */
export async function visibleRatingSummary(trainerId: string) {
  const groups = await db.review.groupBy({
    by: ["rating"],
    where: { trainerId, hidden: false },
    _count: { _all: true },
  });
  return summarizeRatings(groups.map((g) => ({ rating: g.rating, count: g._count._all })));
}
