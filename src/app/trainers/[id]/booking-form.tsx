"use client";

import { useActionState, useState } from "react";
import { createBooking } from "@/app/actions/bookings";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Select, Textarea, cx } from "@/components/ui";

export type SlotOption = { value: string; day: string; time: string };

export function BookingForm({ trainerId, slots }: { trainerId: string; slots: SlotOption[] }) {
  const [state, action] = useActionState(createBooking, {});
  const days = [...new Set(slots.map((s) => s.day))];
  const [day, setDay] = useState(days[0]);
  const [startsAt, setStartsAt] = useState<string>();
  const daySlots = slots.filter((s) => s.day === day);

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="trainerId" value={trainerId} />
      <input type="hidden" name="startsAt" value={startsAt ?? ""} />

      <Field label="Day" name="day">
        <Select
          id="day"
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setStartsAt(undefined);
          }}
        >
          {days.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
      </Field>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Time</legend>
        <div className="grid grid-cols-3 gap-2">
          {daySlots.map((slot) => (
            <button
              key={slot.value}
              type="button"
              aria-pressed={startsAt === slot.value}
              onClick={() => setStartsAt(slot.value)}
              className={cx(
                "rounded-lg border px-2 py-1.5 text-sm",
                startsAt === slot.value
                  ? "border-brand bg-brand text-white"
                  : "border-line hover:border-brand",
              )}
            >
              {slot.time}
            </button>
          ))}
        </div>
        {state.fieldErrors?.startsAt && (
          <p className="mt-1 text-xs text-red-600">Pick a time</p>
        )}
      </fieldset>

      <Field label="Notes for your trainer (optional)" name="notes">
        <Textarea id="notes" name="notes" rows={3} maxLength={500} placeholder="Goals, injuries, anything useful" />
      </Field>

      <SubmitButton className="w-full" disabled={!startsAt} pendingText="Booking…">
        Book and pay
      </SubmitButton>
    </form>
  );
}
