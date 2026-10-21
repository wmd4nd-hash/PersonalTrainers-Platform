import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "../ui";

const styles = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-line bg-surface hover:bg-muted",
};

/** A link that looks like a `Button`, for navigation actions. */
export function LinkButton({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof styles }) {
  return (
    <Link
      className={cx(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Same look as `LinkButton`, for plain anchors such as file downloads. */
export function linkButtonClass(variant: keyof typeof styles = "secondary", className?: string) {
  return cx(
    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
    styles[variant],
    className,
  );
}
