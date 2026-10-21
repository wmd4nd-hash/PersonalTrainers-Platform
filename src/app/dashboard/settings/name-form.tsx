"use client";

import { useActionState } from "react";
import { updateAccountName } from "@/app/actions/account";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function NameForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateAccountName, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-3">
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Name" name="name" errors={errors.name} hint="Shown to trainers and clients you book with.">
        <Input id="name" name="name" defaultValue={name} autoComplete="name" minLength={2} maxLength={80} required />
      </Field>
      <SubmitButton>Save name</SubmitButton>
    </form>
  );
}
