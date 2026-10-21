"use client";

import { useActionState, useState } from "react";
import { addTimeOff, type TimeOffState } from "@/app/actions/time-off";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

const initialState: TimeOffState = {};

/** Add a block of time off. Dates and times are in the trainer's timezone. */
export function TimeOffForm({ today }: { today: string }) {
  const [state, action] = useActionState(addTimeOff, initialState);

  return (
    <div className="space-y-3">
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.warning && (
        <p
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {state.warning}
        </p>
      )}
      {state.error && <Alert>{state.error}</Alert>}
      {/* Remount after each submit: fresh fields on success, the entered values after an error. */}
      <TimeOffFields key={state.version ?? 0} action={action} state={state} today={today} />
    </div>
  );
}

function TimeOffFields({
  action,
  state,
  today,
}: {
  action: (formData: FormData) => void;
  state: TimeOffState;
  today: string;
}) {
  const values = state.ok ? {} : (state.values ?? {});
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  const [allDay, setAllDay] = useState(state.values && !state.ok ? values.allDay === "on" : true);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First day" name="timeoff-startDate" errors={errors.startDate}>
          <Input
            id="timeoff-startDate"
            name="startDate"
            type="date"
            min={today}
            defaultValue={values.startDate ?? ""}
            required
          />
        </Field>
        <Field
          label="Last day (optional)"
          name="timeoff-endDate"
          errors={errors.endDate}
          hint="Leave empty for a single day."
        >
          <Input id="timeoff-endDate" name="endDate" type="date" min={today} defaultValue={values.endDate ?? ""} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="allDay"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-4 accent-brand"
        />
        All day
      </label>

      {!allDay && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" name="timeoff-startTime" errors={errors.startTime} hint="On the first day.">
            <Input
              id="timeoff-startTime"
              name="startTime"
              type="time"
              defaultValue={values.startTime ?? "12:00"}
              required
            />
          </Field>
          <Field label="Until" name="timeoff-endTime" errors={errors.endTime} hint="On the last day.">
            <Input id="timeoff-endTime" name="endTime" type="time" defaultValue={values.endTime ?? "14:00"} required />
          </Field>
        </div>
      )}

      <Field label="Reason (optional)" name="timeoff-reason" errors={errors.reason} hint="Only you can see this.">
        <Input
          id="timeoff-reason"
          name="reason"
          maxLength={120}
          defaultValue={values.reason ?? ""}
          placeholder="e.g. Holiday"
        />
      </Field>

      <SubmitButton pendingText="Adding…">Add time off</SubmitButton>
    </form>
  );
}
