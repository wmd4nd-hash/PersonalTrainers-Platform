"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [state, action] = useActionState(login, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Email" name="email" errors={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" name="password" errors={errors.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <p className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-brand">
          Forgot password?
        </Link>
      </p>
      <SubmitButton className="w-full" pendingText="Logging in…">
        Log in
      </SubmitButton>
      <p className="text-center text-sm text-subtle">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand">
          Create an account
        </Link>
      </p>
    </form>
  );
}
