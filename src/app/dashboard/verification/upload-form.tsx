"use client";

import { useActionState, useState } from "react";
import { uploadDocument } from "@/app/actions/verification";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select } from "@/components/ui";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];

export function UploadDocumentForm({ suggestedKind }: { suggestedKind: string }) {
  const [state, action] = useActionState(uploadDocument, {});
  const [kind, setKind] = useState(suggestedKind);
  const [fileError, setFileError] = useState<string>();
  const errors = state.fieldErrors ?? {};

  // The suggested type moves on once a document is in, so follow it (adjusting state
  // during render, not in an effect). The form clears itself after each submit.
  const [seen, setSeen] = useState({ state, suggestedKind });
  if (seen.state !== state || seen.suggestedKind !== suggestedKind) {
    setSeen({ state, suggestedKind });
    if (seen.state !== state) setFileError(undefined);
    if (seen.suggestedKind !== suggestedKind) setKind(suggestedKind);
  }

  /** A quick check before uploading. The server checks again, by the file's real type. */
  function check(input: HTMLInputElement) {
    const file = input.files?.[0];
    setFileError(undefined);
    if (!file) return;
    let problem: string | undefined;
    if (file.type && !ACCEPTED.includes(file.type)) problem = "Choose a PDF, JPEG or PNG file.";
    else if (file.size > MAX_BYTES) problem = `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`;
    if (problem) {
      setFileError(problem);
      input.value = "";
    }
  }

  return (
    <form action={action} className="space-y-4">
      {state.ok && <Alert tone="success">Thanks! We&apos;ll review your document and let you know.</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Document type" name="kind" errors={errors.kind}>
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} required>
            <option value="CERTIFICATION">Certification</option>
            <option value="INSURANCE">Insurance</option>
            <option value="IDENTITY">Identity</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field
          label="Expiry date (optional)"
          name="expiresOn"
          errors={errors.expiresOn}
          hint="As printed on the certificate or policy"
        >
          <Input id="expiresOn" name="expiresOn" type="date" />
        </Field>
      </div>
      <Field
        label="File"
        name="file"
        errors={fileError ? [fileError] : errors.file}
        hint="PDF, JPEG or PNG, up to 5 MB. Make sure your name and the dates are readable."
      >
        <input
          id="file"
          name="file"
          type="file"
          accept={ACCEPTED.join(",")}
          required
          onChange={(e) => check(e.currentTarget)}
          className="block w-full max-w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
        />
      </Field>
      <SubmitButton pendingText="Uploading…">
        Upload document
      </SubmitButton>
    </form>
  );
}
