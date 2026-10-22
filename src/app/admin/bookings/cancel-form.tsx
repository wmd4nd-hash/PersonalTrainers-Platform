"use client";

import { useActionState } from "react";
import { adminCancelBooking } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Textarea } from "@/components/ui";

/** Admin cancel with a reason. The booking lifecycle refunds card payments in full. */
export function CancelBookingForm({ bookingId, outcome }: { bookingId: string; outcome: string }) {
  const [state, action] = useActionState(adminCancelBooking.bind(null, bookingId), {});
  const reasonId = `reason-${bookingId}`;

  return (
    <details className="group w-full rounded-lg border border-line open:p-3 sm:w-auto sm:min-w-72">
      <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 group-open:mb-2 group-open:px-0 group-open:py-0 group-open:hover:bg-transparent dark:text-red-300 dark:hover:bg-red-950">
        Cancel booking
      </summary>
      <form action={action} className="space-y-3">
        {state.error && <Alert>{state.error}</Alert>}
        <p className="text-xs text-subtle">{outcome} Both people are notified.</p>
        <Field label="Reason (optional)" name={reasonId} errors={state.fieldErrors?.reason} hint="Kept on the booking for the record">
          <Textarea id={reasonId} name="reason" rows={2} maxLength={300} placeholder="e.g. Trainer account under review" />
        </Field>
        <SubmitButton variant="danger" pendingText="Cancelling…">
          Confirm cancellation
        </SubmitButton>
      </form>
    </details>
  );
}
