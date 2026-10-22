import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { newestFirst, visibleRatingSummary } from "@/app/trainers/[id]/reviews/_components/data";
import { Pagination } from "@/app/trainers/[id]/reviews/_components/pagination";
import { ReviewCard } from "@/app/trainers/[id]/reviews/_components/review-card";
import { RatingBreakdown } from "@/components/star-rating-breakdown";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import { paginate, parsePage } from "@/lib/reviews";
import { formatSlot } from "@/lib/scheduling";
import { ReplyForm } from "./reply-form";

export const metadata: Metadata = { title: "Reviews" };

const PER_PAGE = 20;

export default function ReviewsPage({ searchParams }: PageProps<"/dashboard/reviews">) {
  return (
    <>
      <PageHeader title="Reviews" description="What clients say about your sessions. Replies are shown publicly." />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <TrainerReviews searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TrainerReviews({ searchParams }: Pick<PageProps<"/dashboard/reviews">, "searchParams">) {
  // Trainers only; clients and admins are sent back to their own area.
  const trainerId = await requireTrainerProfileId();
  const { page } = await searchParams;

  const [trainer, summary, total] = await Promise.all([
    db.trainerProfile.findUniqueOrThrow({
      where: { id: trainerId },
      select: { id: true, timezone: true, published: true, user: { select: { name: true } } },
    }),
    visibleRatingSummary(trainerId),
    db.review.count({ where: { trainerId } }),
  ]);
  const pager = paginate(total, parsePage(page), PER_PAGE);
  const reviews = await db.review.findMany({
    where: { trainerId },
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      trainerReply: true,
      repliedAt: true,
      hidden: true,
      client: { select: { name: true } },
      booking: { select: { id: true, startsAt: true } },
    },
    orderBy: newestFirst,
    skip: pager.skip,
    take: pager.take,
  });

  if (total === 0) {
    return (
      <Card className="text-sm text-subtle">
        No reviews yet. After you mark a session as completed, your client can leave a review for 60 days.
      </Card>
    );
  }

  const firstName = trainer.user.name.split(/\s+/)[0]!;

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <RatingBreakdown summary={summary} />
        {trainer.published && (
          <Link href={`/trainers/${trainer.id}#reviews`} className="inline-block text-sm font-medium text-brand hover:underline">
            See your reviews as clients do →
          </Link>
        )}
      </Card>

      <ul className="space-y-3">
        {reviews.map((review) => (
          <li key={review.id}>
            <Card>
              <ReviewCard
                review={review}
                authorName={review.client.name}
                trainerName={firstName}
                timezone={trainer.timezone}
                meta={
                  <Link href={`/dashboard/bookings/${review.booking.id}`} className="hover:underline">
                    Session {formatSlot(review.booking.startsAt, trainer.timezone)}
                  </Link>
                }
                badges={
                  review.hidden && (
                    <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Hidden by our team
                    </Badge>
                  )
                }
              >
                {review.hidden ? (
                  <p className="text-xs text-subtle">
                    Hidden reviews don&apos;t appear on your profile or count toward your rating.
                  </p>
                ) : (
                  <ReplyForm reviewId={review.id} reply={review.trainerReply} />
                )}
              </ReviewCard>
            </Card>
          </li>
        ))}
      </ul>

      <Pagination pager={pager} hrefFor={(n) => (n > 1 ? `/dashboard/reviews?page=${n}` : "/dashboard/reviews")} />
    </div>
  );
}
