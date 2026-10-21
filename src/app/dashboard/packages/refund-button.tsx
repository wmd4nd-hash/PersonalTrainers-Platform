"use client";

import { useActionState, useState } from "react";
import { refundUnusedSessions } from "@/app/actions/packages";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button } from "@/components/ui";

/** Two-step "Refund unused sessions" so a stray tap can't cancel a client's package. */
export function RefundButton({
  purchaseId,
  clientName,
  summary,
}: {
  purchaseId: string;
  clientName: string;
  /** e.g. "$160.00 for 2 unused sessions" */
  summary: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState(refundUnusedSessions.bind(null, purchaseId), {});

  if (!confirming) {
    return (
      <Button type="button" variant="danger" className="whitespace-nowrap px-3 py-1.5" onClick={() => setConfirming(true)}>
        Refund unused sessions
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-2">
      {state.error && <Alert>{state.error}</Alert>}
      <p className="text-xs">
        Refund {summary} to {clientName}? Their package will be cancelled.
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" className="px-3 py-1.5" pendingText="Refunding…" autoFocus>
          Confirm refund
        </SubmitButton>
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => setConfirming(false)}>
          Keep package
        </Button>
      </div>
    </form>
  );
}
