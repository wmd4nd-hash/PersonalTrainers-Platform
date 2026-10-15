"use client";

import { useActionState } from "react";
import { addAvailability } from "@/app/actions/trainer";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select } from "@/components/ui";
import { DAY_NAMES } from "@/lib/scheduling";

export function AddWindowForm() {
  const [state, action] = useActionState(addAvailability, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <Field label="Day" name="dayOfWeek" errors={errors.dayOfWeek}>
        <Select id="dayOfWeek" name="dayOfWeek" defaultValue="1">
          {DAY_NAMES.map((day, i) => (
            <option key={day} value={i}>
              {day}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" name="start" errors={errors.start}>
        <Input id="start" name="start" type="time" defaultValue="09:00" required />
      </Field>
      <Field label="To" name="end" errors={errors.end}>
        <Input id="end" name="end" type="time" defaultValue="17:00" required />
      </Field>
      <SubmitButton pendingText="Adding…">Add</SubmitButton>
    </form>
  );
}
