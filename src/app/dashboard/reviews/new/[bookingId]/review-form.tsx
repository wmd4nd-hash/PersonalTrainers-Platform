"use client";

import { useActionState, useState } from "react";
import { createReview } from "@/app/actions/reviews";
import { StarRatingInput } from "@/components/star-rating-input";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Textarea } from "@/components/ui";
import { MAX_COMMENT_LENGTH } from "@/lib/reviews";

export function ReviewForm({ bookingId, trainerFirstName }: { bookingId: string; trainerFirstName: string }) {
  const [state, action] = useActionState(createReview.bind(null, bookingId), {});
  const [comment, setComment] = useState("");
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert>{state.error}</Alert>}
      <StarRatingInput name="rating" label={`How was your session with ${trainerFirstName}?`} errors={errors.rating} />
      <Field
        label="Your review (optional)"
        name="comment"
        errors={errors.comment}
        hint="What went well? What could be better? Your first name and last initial are shown with your review."
      >
        <Textarea
          id="comment"
          name="comment"
          rows={5}
          maxLength={MAX_COMMENT_LENGTH}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          aria-describedby="comment-count"
        />
      </Field>
      <p id="comment-count" className="-mt-3 text-right text-xs text-subtle tabular-nums">
        {comment.length}/{MAX_COMMENT_LENGTH}
      </p>
      <SubmitButton pendingText="Posting…">Post review</SubmitButton>
    </form>
  );
}
