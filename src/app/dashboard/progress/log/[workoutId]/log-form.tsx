"use client";

import { useActionState } from "react";
import { logWorkout } from "@/app/actions/progress";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { logFieldName, type FormStateWithValues } from "@/lib/validation/coaching";

export type LogExercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  /** What the client did last time they logged this workout, to prefill. */
  last: { setsDone: number; reps: string; weightKg: number | null } | null;
};

const effortLabels: Record<number, string> = {
  1: "Very easy",
  2: "Very easy",
  3: "Easy",
  4: "Easy",
  5: "Moderate",
  6: "Moderate",
  7: "Hard",
  8: "Hard",
  9: "Very hard",
  10: "All-out",
};

function describeLast({ setsDone, reps, weightKg }: NonNullable<LogExercise["last"]>) {
  const base = reps ? `${setsDone} × ${reps}` : `${setsDone} sets`;
  return weightKg ? `${base} @ ${weightKg} kg` : base;
}

export function LogWorkoutForm({ workoutId, exercises }: { workoutId: string; exercises: LogExercise[] }) {
  const [state, action] = useActionState(logWorkout.bind(null, workoutId), {} as FormStateWithValues);
  const errors = state.fieldErrors ?? {};
  // After a rejected submit, keep what was typed rather than the prefilled values.
  const value = (name: string, fallback: string | number) => state.values?.[name] ?? String(fallback);

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      {exercises.map((ex) => {
        const names = {
          sets: logFieldName(ex.id, "sets"),
          reps: logFieldName(ex.id, "reps"),
          weight: logFieldName(ex.id, "weight"),
        };
        const id = (field: string) => `log-${ex.id}-${field}`;
        return (
          <fieldset key={ex.id} className="rounded-xl border border-line bg-surface p-4">
            <legend className="px-1 font-semibold">{ex.name}</legend>
            <p className="mb-3 text-xs text-subtle">
              Target {ex.sets} × {ex.reps} · rest {ex.restSeconds}s
              {ex.last && <> · Last time {describeLast(ex.last)}</>}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sets done" name={id("sets")} errors={errors[names.sets]}>
                <Input
                  id={id("sets")}
                  name={names.sets}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  defaultValue={value(names.sets, ex.sets)}
                  required
                />
              </Field>
              <Field label="Reps" name={id("reps")} errors={errors[names.reps]}>
                <Input
                  id={id("reps")}
                  name={names.reps}
                  maxLength={30}
                  placeholder={ex.reps}
                  defaultValue={value(names.reps, ex.last?.reps || ex.reps)}
                />
              </Field>
              <Field label="Weight (kg)" name={id("weight")} errors={errors[names.weight]}>
                <Input
                  id={id("weight")}
                  name={names.weight}
                  inputMode="decimal"
                  pattern="\d{1,4}([.,]\d{1,2})?"
                  title="Kilograms, e.g. 42.5"
                  placeholder="Bodyweight"
                  defaultValue={value(names.weight, ex.last?.weightKg ?? "")}
                />
              </Field>
            </div>
          </fieldset>
        );
      })}

      {exercises.length > 0 && (
        <p className="text-xs text-subtle">Set an exercise to 0 sets if you skipped it.</p>
      )}

      <Card className="space-y-4">
        <Field label="Effort (1-10)" name="log-effort" errors={errors.effort} hint="How hard did the whole workout feel?">
          <Select id="log-effort" name="effort" defaultValue={value("effort", "")}>
            <option value="">Not rated</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} – {effortLabels[n]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" name="log-notes" errors={errors.notes}>
          <Textarea
            id="log-notes"
            name="notes"
            rows={3}
            maxLength={1000}
            placeholder="How did it go? Anything your trainer should know?"
            defaultValue={value("notes", "")}
          />
        </Field>
      </Card>

      <SubmitButton className="w-full sm:w-auto" pendingText="Saving…">
        Save workout
      </SubmitButton>
    </form>
  );
}
