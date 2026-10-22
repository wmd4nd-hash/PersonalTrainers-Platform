"use client";

import { useEffect, useRef, useState } from "react";
import { removeAvatar, uploadAvatar } from "@/app/actions/avatar";
import { Avatar } from "@/components/avatar";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card } from "@/components/ui";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

type Message = { tone: "error" | "success"; text: string };

/** Profile photo with a preview before upload. The server re-checks size and type. */
export function PhotoUpload({ name, avatarFileId }: { name: string; avatarFileId: string | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Free the previous preview's memory whenever it changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function choose(file: File | undefined) {
    setMessage(null);
    setPreview(null);
    if (!file) return;
    let problem: string | null = null;
    if (file.type && !ACCEPTED.includes(file.type)) problem = "Choose a JPEG, PNG or WebP image.";
    else if (file.size > MAX_BYTES) problem = `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`;
    if (problem) {
      setMessage({ tone: "error", text: problem });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  async function upload(formData: FormData) {
    const result = await uploadAvatar({}, formData);
    setPreview(null);
    setMessage(
      result.ok
        ? { tone: "success", text: "Your new photo is live." }
        : { tone: "error", text: result.fieldErrors?.photo?.[0] ?? result.error ?? "Something went wrong. Try again." },
    );
  }

  async function remove() {
    await removeAvatar();
    setMessage({ tone: "success", text: "Photo removed." });
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
          <form action={upload} className="flex flex-wrap items-center gap-2">
            <label htmlFor="photo" className="sr-only">
              Choose a photo
            </label>
            <input
              ref={inputRef}
              id="photo"
              name="photo"
              type="file"
              accept={ACCEPTED.join(",")}
              onChange={(e) => choose(e.target.files?.[0])}
              className="max-w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
            />
            <SubmitButton disabled={!preview} pendingText="Uploading…">
              {avatarFileId ? "Replace photo" : "Upload photo"}
            </SubmitButton>
          </form>
          {avatarFileId && !preview && (
            <form action={remove}>
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
