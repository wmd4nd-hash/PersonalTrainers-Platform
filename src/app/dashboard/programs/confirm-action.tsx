"use client";

import { useState, type ReactNode } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui";

/**
 * A destructive button that asks for confirmation in place before submitting
 * `action`, so nothing is lost to a stray click.
 */
export function ConfirmAction({
  action,
  label,
  confirmLabel,
  pendingText,
  message,
  buttonClassName,
  ariaLabel,
}: {
  action: () => Promise<void>;
  label: ReactNode;
  /** Accessible name for the first button when `label` alone is ambiguous, e.g. "Delete workout Legs". */
  ariaLabel?: string;
  confirmLabel: string;
  pendingText?: string;
  message: ReactNode;
  buttonClassName?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="danger"
        className={buttonClassName}
        aria-label={ariaLabel}
        onClick={() => setConfirming(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-red-300 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-950/30"
    >
      <p className="text-sm">{message}</p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" pendingText={pendingText} autoFocus>
          {confirmLabel}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
