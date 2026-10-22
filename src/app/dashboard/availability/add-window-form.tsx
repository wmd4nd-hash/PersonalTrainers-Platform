"use client";

import { useActionState } from "react";
import { addAvailability, type AvailabilityFormState } from "@/app/actions/trainer";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select } from "@/components/ui";
import { DAY_NAMES, DISPLAY_WEEK } from "@/lib/scheduling";

const initialState: AvailabilityFormState = {};

export function AddWindowForm() {
  const [state, action] = useActionState(addAvailability, initialState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <div className="space-y-3">
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      {/* Remount after each submit so fields show what the server sent back. */}
      <form key={state.version ?? 0} action={action} className="grid grid-cols-2 items-start gap-3">
        <div className="col-span-2">
          <Field label="Day" name="dayOfWeek" errors={errors.dayOfWeek}>
            <Select id="dayOfWeek" name="dayOfWeek" defaultValue={values.dayOfWeek ?? "1"}>
              {DISPLAY_WEEK.map((day) => (
                <option key={day} value={day}>
                  {DAY_NAMES[day]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="From" name="start" errors={errors.start}>
          <Input id="start" name="start" type="time" defaultValue={values.start ?? "09:00"} required />
        </Field>
        <Field label="To" name="end" errors={errors.end}>
          <Input id="end" name="end" type="time" defaultValue={values.end ?? "17:00"} required />
        </Field>
        <div className="col-span-2">
          <SubmitButton pendingText="Adding…">Add hours</SubmitButton>
        </div>
      </form>
    </div>
  );
}
