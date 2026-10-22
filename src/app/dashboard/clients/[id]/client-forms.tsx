"use client";

import { useActionState, useEffect, useRef } from "react";
import { addClientNote, assignProgramFromClientPage } from "@/app/actions/clients";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/validation";

function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function AddNoteForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(addClientNote.bind(null, clientId), {});
  const ref = useResetOnSuccess(state);

  return (
    <form ref={ref} action={action} className="space-y-2">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="New note" name="note-body" errors={state.fieldErrors?.body}>
        <Textarea
          id="note-body"
          name="body"
          rows={3}
          maxLength={2000}
          placeholder="Goals, injuries, what to focus on next time…"
          required
        />
      </Field>
      <SubmitButton variant="secondary" pendingText="Saving…">
        Add note
      </SubmitButton>
    </form>
  );
}

export function AssignProgramForm({
  clientId,
  programs,
}: {
  clientId: string;
  programs: { id: string; title: string }[];
}) {
  const [state, action] = useActionState(assignProgramFromClientPage.bind(null, clientId), {});
  const ref = useResetOnSuccess(state);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={ref} action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Assign a program" name="client-assign-program" errors={errors.programId}>
        <Select id="client-assign-program" name="programId" required>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Start date (optional)" name="client-assign-startsOn" errors={errors.startsOn}>
        <Input id="client-assign-startsOn" name="startsOn" type="date" />
      </Field>
      <SubmitButton className="w-full" pendingText="Assigning…">
        Assign program
      </SubmitButton>
    </form>
  );
}
