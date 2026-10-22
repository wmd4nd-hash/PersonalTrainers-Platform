import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { StarRating } from "@/components/star-rating";
import { formatReviewDate } from "@/lib/reviews";

export type ReviewCardData = {
  rating: number;
  comment: string;
  createdAt: Date;
  trainerReply: string;
  repliedAt: Date | null;
};

/**
 * One review: who wrote it, when, the stars, the comment and the trainer's reply.
 * Shared by the public trainer pages, the trainer's dashboard and moderation.
 */
export function ReviewCard({
  review,
  authorName,
  trainerName,
  timezone,
  meta,
  badges,
  children,
}: {
  review: ReviewCardData;
  /** As the viewer should see it, e.g. "Priya S." in public. */
  authorName: string;
  trainerName: string;
  timezone: string;
  /** Extra detail after the date, e.g. "Verified session". */
  meta?: ReactNode;
  badges?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="space-y-3">
      <header className="flex items-start gap-3">
        <Avatar name={authorName} size={36} />
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">{authorName}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
            <StarRating value={review.rating} size="sm" label={`${review.rating} out of 5 stars`} />
            <span className="min-w-0 break-words">
              <time dateTime={review.createdAt.toISOString()}>{formatReviewDate(review.createdAt, timezone)}</time>
              {meta && <> · {meta}</>}
            </span>
          </div>
        </div>
      </header>
      {badges && <div className="flex flex-wrap gap-2">{badges}</div>}
      {review.comment ? (
        <p className="whitespace-pre-line break-words text-sm leading-6">{review.comment}</p>
      ) : (
        <p className="text-sm text-subtle">Left a rating without a comment.</p>
      )}
      {review.trainerReply && (
        <div className="rounded-lg border-l-2 border-brand bg-muted px-3 py-2 sm:ml-6">
          <p className="text-xs font-medium">
            Response from {trainerName}
            {review.repliedAt && (
              <span className="font-normal text-subtle">
                {" "}
                · <time dateTime={review.repliedAt.toISOString()}>{formatReviewDate(review.repliedAt, timezone)}</time>
              </span>
            )}
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-6">{review.trainerReply}</p>
        </div>
      )}
      {children}
    </article>
  );
}
