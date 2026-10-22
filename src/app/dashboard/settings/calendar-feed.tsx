"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { resetCalendarLink } from "@/app/actions/account";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Input } from "@/components/ui";

export function CalendarFeed({ url }: { url: string }) {
  const [state, action] = useActionState(resetCalendarLink, {});
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const webcal = url.replace(/^https?:\/\//, "webcal://");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access (old browser or insecure page): select it for a manual copy.
      inputRef.current?.select();
    }
  }

  return (
    <div className="space-y-4">
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <Field label="Your private calendar link" name="calendarUrl" hint="Keep it private: anyone with this link can see your sessions.">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            id="calendarUrl"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 font-mono text-xs"
          />
          <Button type="button" variant="secondary" onClick={copy} className="shrink-0">
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Field>
      <p aria-live="polite" className="sr-only">
        {copied ? "Calendar link copied" : ""}
      </p>

      <details className="rounded-lg border border-line px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">How to subscribe</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-subtle">
          <li>
            <span className="font-medium text-foreground">Google Calendar:</span> Other calendars, then the plus
            sign, then From URL. Paste the link.
          </li>
          <li>
            <span className="font-medium text-foreground">Apple Calendar:</span> File, then New Calendar
            Subscription, or{" "}
            <a href={webcal} className="font-medium text-brand">
              open it in your calendar app
            </a>
            .
          </li>
          <li>
            <span className="font-medium text-foreground">Outlook:</span> Add calendar, then Subscribe from web.
          </li>
        </ul>
      </details>

      <form
        action={action}
        onSubmit={(e) => {
          if (!window.confirm("Reset your calendar link? Calendars subscribed to the old link will stop updating.")) {
            e.preventDefault();
          }
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <SubmitButton variant="secondary" pendingText="Resetting…">
          Reset link
        </SubmitButton>
        <p className="text-xs text-subtle">Shared it by mistake? Resetting stops the old link working.</p>
      </form>
    </div>
  );
}
