"use client";

import { useActionState } from "react";
import { updateEmailPreferences } from "@/app/actions/account";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";

export function EmailPreferencesForm({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState(updateEmailPreferences, {});

  return (
    <form action={action} className="space-y-3">
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="emailNotifications"
          defaultChecked={enabled}
          className="mt-0.5 size-4 accent-brand"
          aria-describedby="email-notifications-hint"
        />
        <span>
          <span className="font-medium">Email me about activity on my account</span>
          <span id="email-notifications-hint" className="block text-xs text-subtle">
            Security emails, like password resets and password changes, are always sent.
          </span>
        </span>
      </label>
      <SubmitButton variant="secondary">Save email settings</SubmitButton>
    </form>
  );
}
