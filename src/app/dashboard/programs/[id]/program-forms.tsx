"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import {
  addExercise,
  addWorkout,
  assignProgram,
  deleteExercise,
  moveExercise,
  updateExercise,
  updateProgram,
} from "@/app/actions/programs";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/validation";

/** Clears a form after a successful submit. */
function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

/**
 * Runs a form action and calls `onSuccess` when it returns ok, e.g. to close an
 * inline editor once the refreshed data has arrived.
 */
function useActionWithSuccess(
  action: (prev: FormState, formData: FormData) => Promise<FormState>,
  onSuccess: () => void,
) {
  return useActionState(async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) onSuccess();
    return result;
  }, {});
}

type ProgramDetails = { id: string; title: string; description: string };

/** Title and description, with an inline editor for the program's owner. */
export function ProgramHeader({ program, actions }: { program: ProgramDetails; actions: ReactNode }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditProgramForm program={program} onClose={() => setEditing(false)} />;
  }
  return (
    <div className="mb-6">
      <PageHeader
        title={program.title}
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              Edit details
            </Button>
            {actions}
          </div>
        }
      />
      {program.description ? (
        <p className="-mt-3 whitespace-pre-line text-sm text-subtle">{program.description}</p>
      ) : (
        <p className="-mt-3 text-sm text-subtle">No description yet.</p>
      )}
    </div>
  );
}

function EditProgramForm({ program, onClose }: { program: ProgramDetails; onClose: () => void }) {
  const [state, action] = useActionWithSuccess(updateProgram.bind(null, program.id), onClose);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="mb-6 space-y-4 rounded-xl border border-line bg-surface p-5">
      <h1 className="text-lg font-semibold">Edit program</h1>
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Title" name="program-title" errors={errors.title}>
        <Input id="program-title" name="title" defaultValue={program.title} maxLength={120} required />
      </Field>
      <Field label="Description" name="program-description" errors={errors.description}>
        <Textarea
          id="program-description"
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={program.description}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AddWorkoutForm({ programId, nextDay }: { programId: string; nextDay: number }) {
  const [state, action] = useActionState(addWorkout.bind(null, programId), {});
  const ref = useResetOnSuccess(state);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <Field label="Day" name="workout-dayNumber" errors={errors.dayNumber}>
          <Input
            id="workout-dayNumber"
            name="dayNumber"
            type="number"
            min={1}
            max={365}
            defaultValue={nextDay}
            key={nextDay}
            required
          />
        </Field>
        <Field label="Title" name="workout-title" errors={errors.title}>
          <Input id="workout-title" name="title" placeholder="e.g. Lower body" required />
        </Field>
      </div>
      <Field label="Notes" name="workout-notes" errors={errors.notes}>
        <Textarea id="workout-notes" name="notes" rows={2} placeholder="Warm-up, focus cues…" />
      </Field>
      <SubmitButton pendingText="Adding…">Add workout</SubmitButton>
    </form>
  );
}

type ExerciseFields = { name: string; sets: number; reps: string; restSeconds: number };

/** The four exercise inputs, shared by the add and edit forms. */
function ExerciseInputs({
  idPrefix,
  errors,
  defaults,
}: {
  idPrefix: string;
  errors: Record<string, string[] | undefined>;
  defaults: ExerciseFields;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
      <div className="col-span-3 sm:col-span-1">
        <Field label="Exercise" name={id("name")} errors={errors.name}>
          <Input id={id("name")} name="name" placeholder="Back squat" defaultValue={defaults.name} maxLength={120} required />
        </Field>
      </div>
      <Field label="Sets" name={id("sets")} errors={errors.sets}>
        <Input id={id("sets")} name="sets" type="number" min={1} max={20} defaultValue={defaults.sets} required />
      </Field>
      <Field label="Reps" name={id("reps")} errors={errors.reps}>
        <Input id={id("reps")} name="reps" defaultValue={defaults.reps} maxLength={30} required />
      </Field>
      <Field label="Rest (s)" name={id("rest")} errors={errors.restSeconds}>
        <Input
          id={id("rest")}
          name="restSeconds"
          type="number"
          min={0}
          max={900}
          step={15}
          defaultValue={defaults.restSeconds}
          required
        />
      </Field>
    </>
  );
}

/** Name on its own row on phones, then sets / reps / rest side by side. */
const exerciseGrid = "grid grid-cols-3 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]";

export function AddExerciseForm({ programId, workoutId }: { programId: string; workoutId: string }) {
  const [state, action] = useActionState(addExercise.bind(null, programId, workoutId), {});
  const ref = useResetOnSuccess(state);

  return (
    <form ref={ref} action={action} aria-label="Add an exercise" className={`${exerciseGrid} border-t border-line pt-3`}>
      {state.error && (
        <div className="col-span-3 sm:col-span-5">
          <Alert>{state.error}</Alert>
        </div>
      )}
      <ExerciseInputs
        idPrefix={workoutId}
        errors={state.fieldErrors ?? {}}
        defaults={{ name: "", sets: 3, reps: "8-12", restSeconds: 90 }}
      />
      <SubmitButton variant="secondary" pendingText="…" className="col-span-3 sm:col-span-1">
        Add
      </SubmitButton>
    </form>
  );
}

export type ExerciseRowData = ExerciseFields & { id: string };

/** One exercise in the owner's view: reorder, edit inline or remove. */
export function ExerciseRow({
  programId,
  exercise,
  loggedSets,
  isFirst,
  isLast,
}: {
  programId: string;
  exercise: ExerciseRowData;
  /** How many times clients have logged this exercise; removing it deletes those entries. */
  loggedSets: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const remove = deleteExercise.bind(null, programId, exercise.id);

  if (confirmingRemove) {
    return (
      <li className="py-3">
        <form action={remove} className="space-y-2 rounded-lg border border-red-300 p-3 text-sm dark:border-red-800">
          <p>
            Remove {exercise.name}? Clients have logged it {loggedSets === 1 ? "once" : `${loggedSets} times`}, and
            those numbers will be deleted from their progress.
          </p>
          <div className="flex gap-2">
            <SubmitButton variant="danger" pendingText="Removing…" autoFocus>
              Remove exercise
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setConfirmingRemove(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  if (editing) {
    return (
      <li className="py-3">
        <EditExerciseForm programId={programId} exercise={exercise} onClose={() => setEditing(false)} />
      </li>
    );
  }

  const small = "px-2 py-1 text-xs";
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{exercise.name}</p>
        <p className="text-xs text-subtle">
          {exercise.sets} × {exercise.reps} · {exercise.restSeconds}s rest
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <form action={moveExercise.bind(null, programId, exercise.id, "up")}>
          <SubmitButton variant="ghost" className={small} disabled={isFirst} aria-label={`Move ${exercise.name} up`}>
            ↑
          </SubmitButton>
        </form>
        <form action={moveExercise.bind(null, programId, exercise.id, "down")}>
          <SubmitButton variant="ghost" className={small} disabled={isLast} aria-label={`Move ${exercise.name} down`}>
            ↓
          </SubmitButton>
        </form>
        <Button
          type="button"
          variant="ghost"
          className={small}
          aria-label={`Edit ${exercise.name}`}
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
        {loggedSets > 0 ? (
          <Button
            type="button"
            variant="ghost"
            className={small}
            aria-label={`Remove ${exercise.name}`}
            onClick={() => setConfirmingRemove(true)}
          >
            ✕
          </Button>
        ) : (
          <form action={remove}>
            <SubmitButton variant="ghost" className={small} aria-label={`Remove ${exercise.name}`}>
              ✕
            </SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}

function EditExerciseForm({
  programId,
  exercise,
  onClose,
}: {
  programId: string;
  exercise: ExerciseRowData;
  onClose: () => void;
}) {
  const [state, action] = useActionWithSuccess(updateExercise.bind(null, programId, exercise.id), onClose);

  return (
    <form action={action} aria-label={`Edit ${exercise.name}`} className="space-y-2">
      {state.error && <Alert>{state.error}</Alert>}
      <div className={exerciseGrid}>
        <ExerciseInputs idPrefix={`edit-${exercise.id}`} errors={state.fieldErrors ?? {}} defaults={exercise} />
        <div className="col-span-3 flex gap-1 sm:col-span-1">
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}

export function AssignForm({
  programId,
  clients,
  hasClients,
}: {
  programId: string;
  /** Clients who don't have this program yet. */
  clients: { id: string; name: string; email: string }[];
  hasClients: boolean;
}) {
  const [state, action] = useActionState(assignProgram.bind(null, programId), {});
  const ref = useResetOnSuccess(state);
  const errors = state.fieldErrors ?? {};

  if (clients.length === 0) {
    return (
      <p className="text-xs text-subtle">
        {hasClients
          ? "All of your clients have this program."
          : "Clients appear here once they have booked a session or bought a package with you."}
      </p>
    );
  }

  return (
    <form ref={ref} action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Assign to" name="assign-clientId" errors={errors.clientId}>
        <Select id="assign-clientId" name="clientId" required>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Start date (optional)"
        name="assign-startsOn"
        errors={errors.startsOn}
        hint="When the client should begin. Leave empty to start now."
      >
        <Input id="assign-startsOn" name="startsOn" type="date" />
      </Field>
      <SubmitButton className="w-full" pendingText="Assigning…">
        Assign program
      </SubmitButton>
    </form>
  );
}
