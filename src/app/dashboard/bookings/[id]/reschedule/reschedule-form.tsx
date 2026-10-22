"use client";

import { useActionState, useState } from "react";
import { rescheduleBooking } from "@/app/actions/reschedule";
import { LocalTime } from "@/components/scheduling/local-time";
import { SlotPicker, type PickerSlot } from "@/components/scheduling/slot-picker";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";

export function RescheduleForm({
  bookingId,
  slots,
  timezone,
  dates,
}: {
  bookingId: string;
  slots: PickerSlot[];
  /** The trainer's timezone. */
  timezone: string;
  /** Every date in the booking horizon (YYYY-MM-DD in the trainer's timezone). */
  dates: string[];
}) {
  const [state, action] = useActionState(rescheduleBooking.bind(null, bookingId), {});
  const [startsAt, setStartsAt] = useState<string>();
  const selected = slots.find((s) => s.value === startsAt);

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="startsAt" value={startsAt ?? ""} />

      <SlotPicker
        slots={slots}
        timezone={timezone}
        dates={dates}
        selected={startsAt}
        onSelect={setStartsAt}
        error={state.fieldErrors?.startsAt?.[0]}
      />

      {selected && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          New time:{" "}
          <span className="font-medium">
            {selected.day} at {selected.time}
          </span>
          <LocalTime start={new Date(selected.value)} timezone={timezone} className="block text-xs text-subtle" />
        </p>
      )}

      <SubmitButton className="w-full sm:w-auto" disabled={!startsAt} pendingText="Moving…">
        Move session
      </SubmitButton>
    </form>
  );
}
