"use client";

import { useActionState } from "react";
import { buyPackage } from "@/app/actions/packages";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";

export function BuyPackageButton({ packageId, title, priceLabel }: { packageId: string; title: string; priceLabel: string }) {
  const [state, action] = useActionState(buyPackage, {});
  return (
    <form action={action} className="space-y-2">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="packageId" value={packageId} />
      <SubmitButton className="w-full" pendingText="Starting checkout…" aria-label={`Buy ${title} for ${priceLabel}`}>
        Buy for {priceLabel}
      </SubmitButton>
    </form>
  );
}
