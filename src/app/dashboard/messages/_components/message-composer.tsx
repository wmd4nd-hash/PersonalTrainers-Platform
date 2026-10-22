"use client";

import { useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Alert, Button, Textarea } from "@/components/ui";
import { MESSAGE_MAX_LENGTH } from "@/lib/validation/messaging";

/** Shown once the remaining character count drops below this. */
const COUNTER_THRESHOLD = 200;

/**
 * Message box under the thread. Enter sends, Shift+Enter adds a new line.
 * `onSend` returns an error message, or null once the message is stored.
 */
export function MessageComposer({
  recipientName,
  onSend,
}: {
  recipientName: string;
  onSend: (body: string) => Promise<string | null>;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const [sending, startSending] = useTransition();
  const remaining = MESSAGE_MAX_LENGTH - body.length;
  const canSend = body.trim().length > 0 && remaining >= 0;

  function send() {
    if (!canSend) return;
    const text = body;
    // Clear straight away so the next message can be typed while this one sends.
    setBody("");
    setError(undefined);
    startSending(async () => {
      const failure = await onSend(text);
      if (failure) {
        setError(failure);
        // Put the text back unless something new has been typed.
        setBody((current) => (current ? current : text));
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Leave Enter alone while an input method is composing (Japanese, Chinese…).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-line p-3 sm:p-4">
      {error && <Alert>{error}</Alert>}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="message-body" className="sr-only">
            Message {recipientName}
          </label>
          <Textarea
            id="message-body"
            name="body"
            rows={2}
            maxLength={MESSAGE_MAX_LENGTH}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Message ${recipientName}`}
            aria-describedby="message-hint"
            enterKeyHint="send"
            className="field-sizing-content max-h-48 min-h-11 resize-none"
          />
        </div>
        <Button type="submit" disabled={!canSend} className="shrink-0">
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
      <div className="flex justify-between gap-2 text-xs text-subtle">
        <p id="message-hint" className="hidden sm:block">
          Enter to send, Shift+Enter for a new line
        </p>
        {remaining < COUNTER_THRESHOLD && (
          <p aria-live="polite" className={remaining <= 0 ? "text-red-600 dark:text-red-400" : undefined}>
            {remaining} {remaining === 1 ? "character" : "characters"} left
          </p>
        )}
      </div>
    </form>
  );
}
