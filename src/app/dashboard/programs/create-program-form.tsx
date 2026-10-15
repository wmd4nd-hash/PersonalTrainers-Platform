"use client";

import { useActionState } from "react";
import { createProgram } from "@/app/actions/programs";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Textarea } from "@/components/ui";

export function CreateProgramForm() {
  const [state, action] = useActionState(createProgram, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <Field label="Title" name="title" errors={errors.title}>
        <Input id="title" name="title" placeholder="e.g. 8-week beginner strength" required />
      </Field>
      <Field label="Description" name="description" errors={errors.description}>
        <Textarea id="description" name="description" rows={3} />
      </Field>
      <SubmitButton pendingText="Creating…">Create program</SubmitButton>
    </form>
  );
}
