"use client";

import { useActionState, useState } from "react";
import { deleteReviewReply, saveReviewReply } from "@/app/actions/reviews";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { MAX_REPLY_LENGTH } from "@/lib/reviews";
import type { FormState } from "@/lib/validation";

/** Trainer's single public reply to a review: write it, edit it or remove it. */
export function ReplyForm({ reviewId, reply }: { reviewId: string; reply: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveReviewReply(reviewId, prev, formData);
    // Close the editor once the reply is saved.
    if (result.ok) setEditing(false);
    return result;
  }, {});
  const fieldId = `reply-${reviewId}`;

  if (!editing) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" type="button" onClick={() => setEditing(true)}>
          {reply ? "Edit reply" : "Reply"}
        </Button>
        {reply && (
          <form action={deleteReviewReply.bind(null, reviewId)}>
            <SubmitButton variant="ghost" pendingText="Removing…">
              Remove reply
            </SubmitButton>
          </form>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      <Field
        label={reply ? "Edit your reply" : "Your reply"}
        name={fieldId}
        errors={state.fieldErrors?.reply}
        hint="Shown publicly under the review. Thank the client or add context, and keep it friendly."
      >
        <Textarea
          id={fieldId}
          name="reply"
          rows={3}
          maxLength={MAX_REPLY_LENGTH}
          defaultValue={reply}
          required
          autoFocus
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Saving…">{reply ? "Save reply" : "Post reply"}</SubmitButton>
        <Button variant="ghost" type="button" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
