"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { reviewDocument } from "@/app/actions/admin";
import { Alert, Button, Field, Textarea } from "@/components/ui";

export function ReviewForm({ documentId, label }: { documentId: string; label: string }) {
  const [state, action] = useActionState(reviewDocument.bind(null, documentId), {});
  const errors = state.fieldErrors ?? {};
  const noteId = `note-${documentId}`;

  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Note for the trainer" name={noteId} errors={errors.note} hint="Required when rejecting. The trainer sees this.">
        <Textarea id={noteId} name="note" rows={2} maxLength={500} placeholder="e.g. The scan is blurry, please upload a clearer copy" />
      </Field>
      <DecisionButtons label={label} />
    </form>
  );
}

function DecisionButtons({ label }: { label: string }) {
  const { pending, data } = useFormStatus();
  const deciding = pending ? data?.get("decision") : null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" name="decision" value="APPROVED" disabled={pending} aria-label={`Approve ${label}`}>
        {deciding === "APPROVED" ? "Approving…" : "Approve"}
      </Button>
      <Button type="submit" name="decision" value="REJECTED" variant="danger" disabled={pending} aria-label={`Reject ${label}`}>
        {deciding === "REJECTED" ? "Rejecting…" : "Reject"}
      </Button>
    </div>
  );
}
