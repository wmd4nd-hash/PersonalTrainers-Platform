"use client";

import { useActionState, useEffect, useRef } from "react";
import { addExercise, addWorkout, assignProgram } from "@/app/actions/programs";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/validation";

/** Clears a form after a successful submit. */
function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function AddWorkoutForm({ programId, nextDay }: { programId: string; nextDay: number }) {
  const [state, action] = useActionState(addWorkout.bind(null, programId), {});
  const ref = useResetOnSuccess(state);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <Field label="Day" name="dayNumber" errors={errors.dayNumber}>
          <Input id="dayNumber" name="dayNumber" type="number" min={1} defaultValue={nextDay} key={nextDay} required />
        </Field>
        <Field label="Title" name="title" errors={errors.title}>
          <Input id="title" name="title" placeholder="e.g. Lower body" required />
        </Field>
      </div>
      <Field label="Notes" name="notes" errors={errors.notes}>
        <Textarea id="notes" name="notes" rows={2} placeholder="Warm-up, focus cues…" />
      </Field>
      <SubmitButton pendingText="Adding…">Add workout</SubmitButton>
    </form>
  );
}

export function AddExerciseForm({ programId, workoutId }: { programId: string; workoutId: string }) {
  const [state, action] = useActionState(addExercise.bind(null, programId, workoutId), {});
  const ref = useResetOnSuccess(state);
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `${workoutId}-${name}`;

  return (
    <form ref={ref} action={action} className="grid items-end gap-2 border-t border-line pt-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
      <Field label="Exercise" name={id("name")} errors={errors.name}>
        <Input id={id("name")} name="name" placeholder="Back squat" required />
      </Field>
      <Field label="Sets" name={id("sets")} errors={errors.sets}>
        <Input id={id("sets")} name="sets" type="number" min={1} max={20} defaultValue={3} required />
      </Field>
      <Field label="Reps" name={id("reps")} errors={errors.reps}>
        <Input id={id("reps")} name="reps" defaultValue="8-12" required />
      </Field>
      <Field label="Rest (s)" name={id("rest")} errors={errors.restSeconds}>
        <Input id={id("rest")} name="restSeconds" type="number" min={0} max={900} step={15} defaultValue={90} required />
      </Field>
      <SubmitButton variant="secondary" pendingText="…">
        Add
      </SubmitButton>
    </form>
  );
}

export function AssignForm({
  programId,
  clients,
}: {
  programId: string;
  clients: { id: string; name: string; email: string }[];
}) {
  const [state, action] = useActionState(assignProgram.bind(null, programId), {});

  if (clients.length === 0) {
    return (
      <p className="text-xs text-subtle">
        Clients appear here once they have booked a session with you.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Assign to" name="clientId">
        <Select id="clientId" name="clientId" required>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton className="w-full" pendingText="Assigning…">
        Assign program
      </SubmitButton>
    </form>
  );
}
