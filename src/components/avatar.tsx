import { cx } from "./ui";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0]!.toUpperCase())
    .join("");
}

// Soft tints that read well in light and dark mode. Each name always gets the same one.
const tints = [
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
];

function tintFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return tints[hash % tints.length]!;
}

/** Round profile photo with an initials fallback. Photos are served from /api/files/[id]. */
export function Avatar({
  name,
  fileId,
  size = 40,
  className,
}: {
  name: string;
  fileId?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (fileId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served from our own DB-backed route
      <img
        src={`/api/files/${fileId}`}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={style}
        className={cx("shrink-0 rounded-full bg-muted object-cover", className)}
      />
    );
  }
  const letters = initials(name);
  return (
    <span
      aria-hidden
      style={style}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        tintFor(name.trim().toLowerCase()),
        className,
      )}
    >
      {letters || (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-1/2">
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
        </svg>
      )}
    </span>
  );
}
