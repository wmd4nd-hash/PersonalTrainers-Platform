import { cx } from "../ui";

/** "Join video call" button for online sessions. Opens in a new tab. */
export function JoinCallLink({
  href,
  size = "md",
  className,
}: {
  href: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand font-medium text-white transition-colors hover:bg-brand-dark",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={size === "sm" ? "size-3.5" : "size-4"}>
        <path d="M3.25 5A2.25 2.25 0 0 0 1 7.25v5.5A2.25 2.25 0 0 0 3.25 15h7.5A2.25 2.25 0 0 0 13 12.75v-5.5A2.25 2.25 0 0 0 10.75 5h-7.5ZM18.5 6.27a.75.75 0 0 0-1.1-.66l-3.15 1.68v5.42l3.15 1.68a.75.75 0 0 0 1.1-.66V6.27Z" />
      </svg>
      Join video call
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
