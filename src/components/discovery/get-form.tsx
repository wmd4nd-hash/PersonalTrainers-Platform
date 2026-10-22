"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ComponentProps } from "react";
import { cx } from "@/components/ui";

/**
 * A search form that navigates to `action` with its fields as URL params,
 * leaving blank fields out so shared links stay short. Without JavaScript it
 * is a plain GET form and still works.
 */
export function GetForm({
  action,
  className,
  ...props
}: Omit<ComponentProps<"form">, "action" | "method" | "onSubmit"> & { action: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      {...props}
      action={action}
      method="get"
      aria-busy={pending}
      className={cx(className, pending && "opacity-70")}
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        for (const [name, value] of new FormData(event.currentTarget)) {
          if (typeof value === "string" && value.trim() !== "") params.append(name, value.trim());
        }
        const query = params.toString();
        startTransition(() => router.push(query ? `${action}?${query}` : action));
      }}
    />
  );
}
