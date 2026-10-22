"use client";

import { useState } from "react";
import { startConversationWithClient } from "@/app/actions/messages";
import { SubmitButton } from "@/components/submit-button";
import { Field, Select } from "@/components/ui";

/** Lets a trainer open a conversation with one of their clients. */
export function StartConversationForm({ clients }: { clients: { id: string; name: string; email: string }[] }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");

  return (
    <form action={startConversationWithClient.bind(null, clientId)} className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-56">
        <Field label="Message a client" name="start-client">
          <Select id="start-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingText="Opening…" disabled={!clientId}>
        Start conversation
      </SubmitButton>
    </form>
  );
}
