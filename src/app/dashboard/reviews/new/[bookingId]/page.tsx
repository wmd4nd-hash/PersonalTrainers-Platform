import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReviewCard } from "@/app/trainers/[id]/reviews/_components/review-card";
import { Avatar } from "@/components/avatar";
import { Alert, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatReviewDate, REVIEW_WINDOW_DAYS, reviewEligibility, reviewerName } from "@/lib/reviews";
import { formatSlot } from "@/lib/scheduling";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Leave a review" };

export default function NewReviewPage({ params, searchParams }: PageProps<"/dashboard/reviews/new/[bookingId]">) {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Review your session" description="Reviews help other clients choose the right trainer." />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <NewReview params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewReview({ params, searchParams }: PageProps<"/dashboard/reviews/new/[bookingId]">) {
  const client = await requireRole("CLIENT");
  const { bookingId } = await params;
  const { posted } = await searchParams;

  // Only the booking's own client can open it; anyone else gets a 404.
  const booking = await db.booking.findFirst({
    where: { id: bookingId, clientId: client.id },
    select: {
      id: true,
      clientId: true,
      status: true,
      startsAt: true,
      endsAt: true,
      trainer: {
        select: {
          id: true,
          timezone: true,
          published: true,
          user: { select: { name: true, avatarFileId: true, suspendedAt: true } },
        },
      },
      review: {
        select: { rating: true, comment: true, createdAt: true, trainerReply: true, repliedAt: true, hidden: true },
      },
    },
  });
  if (!booking) notFound();

  const { trainer, review } = booking;
  const firstName = trainer.user.name.split(/\s+/)[0]!;
  const check = reviewEligibility({ ...booking, hasReview: Boolean(review) }, client.id, new Date());
  const profileVisible = trainer.published && !trainer.user.suspendedAt;
  const profileLink = profileVisible && (
    <Link href={`/trainers/${trainer.id}#reviews`} className="font-medium text-brand hover:underline">
      See it on {firstName}&apos;s profile
    </Link>
  );

  return (
    <div className="space-y-4">
      {review && posted && <Alert tone="success">Thanks for your review! We&apos;ve let {firstName} know.</Alert>}

      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={trainer.user.name} fileId={trainer.user.avatarFileId} size={48} />
          <div className="min-w-0">
            <p className="font-medium">{trainer.user.name}</p>
            <p className="text-sm text-subtle">{formatSlot(booking.startsAt, trainer.timezone)}</p>
          </div>
        </div>

        {review ? (
          <div className="space-y-4 border-t border-line pt-4">
            <ReviewCard
              review={review}
              authorName={reviewerName(client.name)}
              trainerName={firstName}
              timezone={trainer.timezone}
              meta="Your review"
            />
            {review.hidden ? (
              <p className="text-sm text-subtle">
                Our team has hidden this review, so it doesn&apos;t appear on {firstName}&apos;s profile.
              </p>
            ) : (
              profileLink && <p className="text-sm">{profileLink}</p>
            )}
          </div>
        ) : check.eligible ? (
          <div className="space-y-4 border-t border-line pt-4">
            <p className="text-sm text-subtle">
              You can review this session until {formatReviewDate(check.deadline, trainer.timezone)}.
            </p>
            <ReviewForm bookingId={booking.id} trainerFirstName={firstName} />
          </div>
        ) : (
          <p className="border-t border-line pt-4 text-sm text-subtle">
            {check.reason === "window-closed"
              ? `Reviews can be left up to ${REVIEW_WINDOW_DAYS} days after a session. The time to review this one ended on ${formatReviewDate(check.deadline, trainer.timezone)}.`
              : `You can leave a review once ${firstName} marks this session as completed.`}
          </p>
        )}
      </Card>

      <Link href="/dashboard" className="inline-block text-sm text-subtle hover:underline">
        ← Back to bookings
      </Link>
    </div>
  );
}
