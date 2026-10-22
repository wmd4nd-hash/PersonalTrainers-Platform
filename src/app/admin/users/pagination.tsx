import Link from "next/link";
import { cx } from "@/components/ui";

/** Previous / next links that keep the current filters. */
export function Pagination({
  basePath,
  params,
  page,
  pages,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pages: number;
}) {
  if (pages <= 1) return null;
  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    if (target > 1) query.set("page", String(target));
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const linkClass = "rounded-lg border border-line bg-surface px-3 py-1.5 hover:bg-muted";
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-2 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass} rel="prev">
          ← Previous
        </Link>
      ) : (
        <span className={cx(linkClass, "pointer-events-none opacity-40")} aria-hidden>
          ← Previous
        </span>
      )}
      <span className="text-subtle">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={linkClass} rel="next">
          Next →
        </Link>
      ) : (
        <span className={cx(linkClass, "pointer-events-none opacity-40")} aria-hidden>
          Next →
        </span>
      )}
    </nav>
  );
}
