import { cx } from "./ui";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
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
        style={style}
        className={cx("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand/15 font-semibold text-brand",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
