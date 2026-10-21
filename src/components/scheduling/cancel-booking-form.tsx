import { cancelBooking } from "@/app/actions/bookings";
import { SubmitButton } from "../submit-button";
import { Field, Input, cx } from "../ui";

export type CancelPreviewNote = { tone: "neutral" | "warning"; text: string };

/** What cancelling now means for the viewer, e.g. the refund they'd get. */
export function CancelPreviewText({ preview, className }: { preview: CancelPreviewNote; className?: string }) {
  return (
    <p
      className={cx(
        "rounded-lg px-3 py-2 text-sm",
        preview.tone === "warning"
          ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          : "bg-muted",
        className,
      )}
    >
      {preview.text}
    </p>
  );
}

/**
 * Cancel a session with an optional reason. Uses the shared `cancelBooking`
 * action, which re-checks who is cancelling and applies the trainer's policy.
 */
export function CancelBookingForm({
  bookingId,
  preview,
  otherName,
}: {
  bookingId: string;
  preview?: CancelPreviewNote;
  /** Who will be told, e.g. "Maya". */
  otherName: string;
}) {
  const reasonId = `cancel-reason-${bookingId}`;
  return (
    <form action={cancelBooking.bind(null, bookingId)} className="space-y-3">
      {preview && <CancelPreviewText preview={preview} />}
      <Field label="Reason (optional)" name={reasonId} hint={`We'll pass this on to ${otherName}.`}>
        <Input id={reasonId} name="reason" maxLength={300} placeholder="e.g. I'm unwell" />
      </Field>
      <SubmitButton variant="danger" pendingText="Cancelling…">
        Cancel session
      </SubmitButton>
    </form>
  );
}
