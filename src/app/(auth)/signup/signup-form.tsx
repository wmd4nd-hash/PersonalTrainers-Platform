"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function SignupForm() {
  const [state, action] = useActionState(signup, {});
  const defaultRole = useSearchParams().get("role") === "TRAINER" ? "TRAINER" : "CLIENT";
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">I want to</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "CLIENT", label: "Train with a coach" },
            { value: "TRAINER", label: "Coach clients" },
          ].map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/5"
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                defaultChecked={option.value === defaultRole}
                className="accent-brand"
              />
              {option.label}
            </label>
          ))}
        </div>
        {errors.role?.map((e) => (
          <p key={e} className="text-xs text-red-600">
            {e}
          </p>
        ))}
      </fieldset>
      <Field label="Name" name="name" errors={errors.name}>
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Email" name="email" errors={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" name="password" errors={errors.password} hint="At least 8 characters">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Creating account…">
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-subtle">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand">
          Log in
        </Link>
      </p>
    </form>
  );
}
