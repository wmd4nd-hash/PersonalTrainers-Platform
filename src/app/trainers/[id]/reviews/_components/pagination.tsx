import Link from "next/link";
import type { Pagination as Pager } from "@/lib/reviews";

const linkStyles = "rounded-lg border border-line bg-surface px-3 py-1.5 font-medium hover:bg-muted";

/** Previous / next links with "Page 2 of 5". Renders nothing for a single page. */
export function Pagination({ pager, hrefFor }: { pager: Pager; hrefFor: (page: number) => string }) {
  if (pager.pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 text-sm">
      {pager.hasPrevious ? (
        <Link href={hrefFor(pager.page - 1)} rel="prev" className={linkStyles}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-subtle">
        Page {pager.page} of {pager.pageCount}
      </span>
      {pager.hasNext ? (
        <Link href={hrefFor(pager.page + 1)} rel="next" className={linkStyles}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
