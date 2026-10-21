"use client";

import { useActionState } from "react";
import { openPayoutsDashboard, startPayoutsSetup } from "@/app/actions/payouts";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";

export function PayoutsSetupForm({ label, simulated }: { label: string; simulated: boolean }) {
  const [state, action] = useActionState(startPayoutsSetup, {});
  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      <SubmitButton pendingText={simulated ? "Setting up…" : "Opening Stripe…"}>{label}</SubmitButton>
    </form>
  );
}

export function PayoutsDashboardForm() {
  const [state, action] = useActionState(openPayoutsDashboard, {});
  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      <SubmitButton variant="secondary" pendingText="Opening Stripe…">
        Open Stripe dashboard
      </SubmitButton>
    </form>
  );
}
