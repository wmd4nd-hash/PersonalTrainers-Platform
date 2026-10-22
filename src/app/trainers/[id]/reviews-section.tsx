import Link from "next/link";
import { Suspense } from "react";
import { RatingBreakdown } from "@/components/star-rating-breakdown";
import { Card, Skeleton } from "@/components/ui";
import { db } from "@/lib/db";
import { reviewCountLabel, reviewerName } from "@/lib/reviews";
import { newestFirst, publicReviewSelect, visibleRatingSummary } from "./reviews/_components/data";
import { ReviewCard } from "./reviews/_components/review-card";

const LATEST_COUNT = 5;

/** Reviews on the trainer's public page: rating breakdown and the latest reviews. */
export function ReviewsSection({ trainerId }: { trainerId: string }) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Reviews trainerId={trainerId} />
    </Suspense>
  );
}

async function Reviews({ trainerId }: { trainerId: string }) {
  const [trainer, summary, latest] = await Promise.all([
    db.trainerProfile.findUnique({
      where: { id: trainerId },
      select: { timezone: true, user: { select: { name: true } } },
    }),
    visibleRatingSummary(trainerId),
    db.review.findMany({
      where: { trainerId, hidden: false },
      select: publicReviewSelect,
      orderBy: newestFirst,
      take: LATEST_COUNT,
    }),
  ]);
  if (!trainer) return null;
  const firstName = trainer.user.name.split(/\s+/)[0];

  return (
    <Card id="reviews" className="scroll-mt-6">
      <section aria-labelledby="reviews-heading" className="space-y-6">
        <h2 id="reviews-heading" className="font-semibold">
          Reviews
        </h2>
        {summary.count === 0 ? (
          <p className="text-sm text-subtle">
            No reviews yet. Clients can review {firstName} after a completed session.
          </p>
        ) : (
          <>
            <RatingBreakdown summary={summary} />
            <ul className="divide-y divide-line border-t border-line">
              {latest.map((review) => (
                <li key={review.id} className="py-4 last:pb-0">
                  <ReviewCard
                    review={review}
                    authorName={reviewerName(review.client.name)}
                    trainerName={firstName}
                    timezone={trainer.timezone}
                    meta="Verified session"
                  />
                </li>
              ))}
            </ul>
            <Link href={`/trainers/${trainerId}/reviews`} className="inline-block text-sm font-medium text-brand hover:underline">
              See all {reviewCountLabel(summary.count)} →
            </Link>
          </>
        )}
      </section>
    </Card>
  );
}
