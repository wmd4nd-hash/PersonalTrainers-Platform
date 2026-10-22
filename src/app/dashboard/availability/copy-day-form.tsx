"use client";

import { useActionState } from "react";
import { copyDayToWeekdays, type AvailabilityFormState } from "@/app/actions/trainer";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Select } from "@/components/ui";
import { DAY_NAMES, WEEKDAYS } from "@/lib/scheduling";

const initialState: AvailabilityFormState = {};

/** "Copy Monday to all weekdays", with any weekday as the source. */
export function CopyDayForm() {
  const [state, action] = useActionState(copyDayToWeekdays, initialState);

  return (
    <form action={action} className="space-y-3">
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Copy the hours from" name="sourceDay" errors={state.fieldErrors?.sourceDay}>
          <Select id="sourceDay" name="sourceDay" defaultValue="1">
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {DAY_NAMES[day]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:pt-6">
          <SubmitButton variant="secondary" className="w-full" pendingText="Copying…">
            Copy to all weekdays
          </SubmitButton>
        </div>
      </div>
      <p className="text-xs text-subtle">
        This replaces your hours on the other weekdays (Monday to Friday). Saturday and Sunday stay as they are.
      </p>
    </form>
  );
}
