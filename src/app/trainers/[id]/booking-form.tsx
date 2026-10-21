"use client";

import { useActionState, useState } from "react";
import { createBooking } from "@/app/actions/bookings";
import { SubmitButton } from "@/components/submit-button";
import { LocalTime } from "@/components/scheduling/local-time";
import { SlotPicker } from "@/components/scheduling/slot-picker";
import { Alert, Field, Textarea, cx } from "@/components/ui";

export type SlotOption = { value: string; day: string; time: string };
export type SessionFormatOption = "IN_PERSON" | "ONLINE";
export type CreditOption = { id: string; label: string };

const formatLabels: Record<SessionFormatOption, string> = {
  IN_PERSON: "In person",
  ONLINE: "Online (video)",
};

const choiceStyles =
  "flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40";

export function BookingForm({
  trainerId,
  slots,
  formats,
  credits,
  priceLabel,
  timezone,
  dates,
}: {
  trainerId: string;
  slots: SlotOption[];
  formats: SessionFormatOption[];
  credits: CreditOption[];
  priceLabel: string;
  /** The trainer's timezone. Enables real dates in the day strip and the client's local times. */
  timezone?: string;
  /** Every date in the booking horizon (YYYY-MM-DD), so days without free times show too. */
  dates?: string[];
}) {
  const [state, action] = useActionState(createBooking, {});
  const [startsAt, setStartsAt] = useState<string>();
  const [payWith, setPayWith] = useState(credits[0]?.id ?? "");
  const selected = slots.find((s) => s.value === startsAt);

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="trainerId" value={trainerId} />
      <input type="hidden" name="startsAt" value={startsAt ?? ""} />

      {formats.length > 1 ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Session type</legend>
          <div className="grid grid-cols-2 gap-2">
            {formats.map((f, i) => (
              <label key={f} className={cx(choiceStyles, "items-center p-2")}>
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

      <SlotPicker
        slots={slots}
        timezone={timezone}
        dates={dates}
        selected={startsAt}
        onSelect={setStartsAt}
        error={state.fieldErrors?.startsAt ? "Pick a time" : undefined}
      />

      {credits.length > 0 ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">How would you like to pay?</legend>
          <div className="space-y-2">
            {credits.map((c) => (
              <label key={c.id} className={choiceStyles}>
                <input
                  type="radio"
                  name="packagePurchaseId"
                  value={c.id}
                  checked={payWith === c.id}
                  onChange={() => setPayWith(c.id)}
                  className="mt-0.5 accent-brand"
                />
                <span>
                  <span className="block font-medium">Use a package session</span>
                  <span className="block text-xs text-subtle">{c.label} · nothing to pay now</span>
                </span>
              </label>
            ))}
            <label className={choiceStyles}>
              <input
                type="radio"
                name="packagePurchaseId"
                value=""
                checked={payWith === ""}
                onChange={() => setPayWith("")}
                className="mt-0.5 accent-brand"
              />
              <span>
                <span className="block font-medium">Pay by card</span>
                <span className="block text-xs text-subtle">{priceLabel} for this session</span>
              </span>
            </label>
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-subtle">You&apos;ll pay {priceLabel} by card to confirm the session.</p>
      )}

      <Field label="Notes for your trainer (optional)" name="notes">
        <Textarea id="notes" name="notes" rows={3} maxLength={500} placeholder="Goals, injuries, anything useful" />
      </Field>

      {selected && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="font-medium">
            {selected.day} at {selected.time}
          </span>
          {timezone && (
            <LocalTime
              start={new Date(selected.value)}
              timezone={timezone}
              className="block text-xs text-subtle"
            />
          )}
        </p>
      )}

      <SubmitButton className="w-full" disabled={!startsAt} pendingText="Booking…">
        {payWith ? "Book with package" : `Book and pay ${priceLabel}`}
      </SubmitButton>
    </form>
  );
}
