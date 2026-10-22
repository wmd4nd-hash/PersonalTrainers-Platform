"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/account";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, {});
  const errors = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          If an account exists for that email, we&apos;ve emailed you a link to reset your password. The link works
          for 1 hour.
        </Alert>
        <p className="text-sm text-subtle">
          Nothing after a few minutes? Check your spam folder, or make sure you used the email you signed up with.
        </p>
        <p className="text-center text-sm">
          <Link href="/login" className="font-medium text-brand">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Email" name="email" errors={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Sending…">
        Email me a reset link
      </SubmitButton>
      <p className="text-center text-sm text-subtle">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand">
          Log in
        </Link>
      </p>
    </form>
  );
}
