"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/account";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-3">
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Current password" name="currentPassword" errors={errors.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New password" name="newPassword" errors={errors.newPassword}>
          <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
        </Field>
        <Field label="Confirm new password" name="confirmPassword" errors={errors.confirmPassword}>
          <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
        </Field>
      </div>
      <SubmitButton pendingText="Changing…">Change password</SubmitButton>
    </form>
  );
}
