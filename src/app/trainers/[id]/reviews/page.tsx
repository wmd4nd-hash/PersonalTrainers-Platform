import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { RatingBreakdown } from "@/components/star-rating-breakdown";
import { Card, Skeleton } from "@/components/ui";
import { db } from "@/lib/db";
import { paginate, parsePage, reviewerName } from "@/lib/reviews";
import { newestFirst, publicReviewSelect, visibleRatingSummary } from "./_components/data";
import { Pagination } from "./_components/pagination";
import { ReviewCard } from "./_components/review-card";

export const metadata: Metadata = { title: "Reviews" };

const PER_PAGE = 10;

export default function TrainerReviewsPage({ params, searchParams }: PageProps<"/trainers/[id]/reviews">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TrainerReviews params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TrainerReviews({ params, searchParams }: PageProps<"/trainers/[id]/reviews">) {
  const { id } = await params;
  const { page } = await searchParams;

  // Same visibility rules as the trainer's public page.
  const trainer = await db.trainerProfile.findFirst({
    where: { id, published: true, user: { suspendedAt: null } },
    select: { id: true, timezone: true, user: { select: { name: true, avatarFileId: true } } },
  });
  if (!trainer) notFound();

  const summary = await visibleRatingSummary(trainer.id);
  const pager = paginate(summary.count, parsePage(page), PER_PAGE);
  const reviews = await db.review.findMany({
    where: { trainerId: trainer.id, hidden: false },
    select: publicReviewSelect,
    orderBy: newestFirst,
    skip: pager.skip,
    take: pager.take,
  });
  const firstName = trainer.user.name.split(/\s+/)[0];
  const profileHref = `/trainers/${trainer.id}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Link href={profileHref} className="text-sm text-subtle hover:underline">
          ← Back to {trainer.user.name}
        </Link>
        <div className="flex items-center gap-3">
          <Avatar name={trainer.user.name} fileId={trainer.user.avatarFileId} size={48} />
          <h1 className="text-2xl font-semibold tracking-tight">Reviews of {trainer.user.name}</h1>
        </div>
      </div>

      {summary.count === 0 ? (
        <Card className="text-sm text-subtle">
          No reviews yet. Clients can review {firstName} after a completed session.{" "}
          <Link href={profileHref} className="font-medium text-brand">
            Book a session
          </Link>
        </Card>
      ) : (
        <>
          <Card>
            <RatingBreakdown summary={summary} />
          </Card>
          <Card>
            <ul className="divide-y divide-line">
              {reviews.map((review) => (
                <li key={review.id} className="py-4 first:pt-0 last:pb-0">
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
          </Card>
          <Pagination
            pager={pager}
            hrefFor={(n) => (n > 1 ? `/trainers/${trainer.id}/reviews?page=${n}` : `/trainers/${trainer.id}/reviews`)}
          />
        </>
      )}
    </div>
  );
}
