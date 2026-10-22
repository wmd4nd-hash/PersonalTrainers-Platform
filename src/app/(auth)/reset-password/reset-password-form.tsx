"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPassword } from "@/app/actions/account";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, {});
  const errors = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Your password has been changed. You can log in with it now.</Alert>
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <Alert>
          {state.error}{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" name="password" errors={errors.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </Field>
      <Field label="Confirm new password" name="confirmPassword" errors={errors.confirmPassword}>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </Field>
      <SubmitButton className="w-full" pendingText="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}
