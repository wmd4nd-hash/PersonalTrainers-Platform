"use client";

import { useActionState, useEffect, useState } from "react";
import { removeAvatar, uploadAvatar } from "@/app/actions/avatar";
import { Avatar } from "@/components/avatar";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card } from "@/components/ui";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

type Message = { tone: "error" | "success"; text: string };

/**
 * Profile photo with a preview before upload. Both forms post straight to their
 * Server Actions, so they work before the page has hydrated; the server re-checks
 * the size and the real file type.
 */
export function PhotoUpload({ name, avatarFileId }: { name: string; avatarFileId: string | null }) {
  const [uploaded, uploadAction] = useActionState(uploadAvatar, {});
  const [removed, removeAction] = useActionState(removeAvatar, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  // Show the outcome of whichever action finished last (adjusting state during render,
  // not in an effect). The form resets itself after a submit, so the preview goes too.
  const [seen, setSeen] = useState({ uploaded, removed });
  if (seen.uploaded !== uploaded || seen.removed !== removed) {
    setSeen({ uploaded, removed });
    setPreview(null);
    if (seen.uploaded !== uploaded) {
      setMessage(
        uploaded.ok
          ? { tone: "success", text: "Your new photo is live." }
          : { tone: "error", text: uploaded.fieldErrors?.photo?.[0] ?? uploaded.error ?? "Something went wrong. Try again." },
      );
    } else if (removed.ok) {
      setMessage({ tone: "success", text: "Photo removed." });
    }
  }

  // Free the previous preview's memory whenever it changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function choose(input: HTMLInputElement) {
    const file = input.files?.[0];
    setMessage(null);
    setPreview(null);
    if (!file) return;
    let problem: string | null = null;
    if (file.type && !ACCEPTED.includes(file.type)) problem = "Choose a JPEG, PNG or WebP image.";
    else if (file.size > MAX_BYTES) problem = `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`;
    if (problem) {
      setMessage({ tone: "error", text: problem });
      input.value = "";
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  return (
    <Card className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex shrink-0 flex-col items-center gap-1">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={preview} alt="Preview of your new photo" className="size-24 rounded-full object-cover ring-2 ring-brand" />
        ) : (
          <Avatar name={name} fileId={avatarFileId} size={96} />
        )}
        {preview && <span className="text-xs text-subtle">Preview</span>}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h2 className="font-semibold">Profile photo</h2>
          <p className="text-sm text-subtle">
            A clear, friendly photo of your face helps clients pick you. JPEG, PNG or WebP, up to 2 MB.
          </p>
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <form action={uploadAction} className="flex min-w-0 flex-wrap items-center gap-2">
            <label htmlFor="photo" className="sr-only">
              Choose a photo
            </label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept={ACCEPTED.join(",")}
              required
              onChange={(e) => choose(e.currentTarget)}
              className="min-w-0 max-w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
            />
            <SubmitButton pendingText="Uploading…">{avatarFileId ? "Replace photo" : "Upload photo"}</SubmitButton>
          </form>
          {avatarFileId && !preview && (
            <form action={removeAction}>
              <SubmitButton variant="ghost" pendingText="Removing…">
                Remove photo
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}
