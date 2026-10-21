"use client";

import { useActionState, useState } from "react";
import { createBooking } from "@/app/actions/bookings";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Select, Textarea, cx } from "@/components/ui";

export type SlotOption = { value: string; day: string; time: string };
export type SessionFormatOption = "IN_PERSON" | "ONLINE";
export type CreditOption = { id: string; label: string };

const formatLabels: Record<SessionFormatOption, string> = {
  IN_PERSON: "In person",
  ONLINE: "Online (video)",
};

export function BookingForm({
  trainerId,
  slots,
  formats,
  credits,
  priceLabel,
}: {
  trainerId: string;
  slots: SlotOption[];
  formats: SessionFormatOption[];
  credits: CreditOption[];
  priceLabel: string;
}) {
  const [state, action] = useActionState(createBooking, {});
  const days = [...new Set(slots.map((s) => s.day))];
  const [day, setDay] = useState(days[0]);
  const [startsAt, setStartsAt] = useState<string>();
  const [payWith, setPayWith] = useState(credits[0]?.id ?? "");
  const daySlots = slots.filter((s) => s.day === day);

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="trainerId" value={trainerId} />
      <input type="hidden" name="startsAt" value={startsAt ?? ""} />

      {formats.length > 1 ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Session type</legend>
          <div className="grid grid-cols-2 gap-2">
            {formats.map((f, i) => (
              <label
                key={f}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-line p-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/5"
              >
                <input type="radio" name="format" value={f} defaultChecked={i === 0} className="accent-brand" />
                {formatLabels[f]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <input type="hidden" name="format" value={formats[0]} />
          <p className="text-sm text-subtle">{formatLabels[formats[0]!]}</p>
        </>
      )}

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
        {state.fieldErrors?.startsAt && <p className="mt-1 text-xs text-red-600">Pick a time</p>}
      </fieldset>

      {credits.length > 0 && (
        <Field label="Pay with" name="packagePurchaseId">
          <Select id="packagePurchaseId" name="packagePurchaseId" value={payWith} onChange={(e) => setPayWith(e.target.value)}>
            {credits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            <option value="">Card ({priceLabel})</option>
          </Select>
        </Field>
      )}

      <Field label="Notes for your trainer (optional)" name="notes">
        <Textarea id="notes" name="notes" rows={3} maxLength={500} placeholder="Goals, injuries, anything useful" />
      </Field>

      <SubmitButton className="w-full" disabled={!startsAt} pendingText="Booking…">
        {payWith ? "Book with package" : `Book and pay ${priceLabel}`}
      </SubmitButton>
    </form>
  );
}
