"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./ui";

export function SubmitButton({
  children,
  pendingText,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}
