"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * The search filters: always shown beside the results on wide screens,
 * folded behind a "Filters" button on phones so results come first.
 */
export function FiltersPanel({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="trainer-filters"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-muted lg:hidden"
      >
        <span>
          Filters
          {activeCount > 0 && (
            <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-white">{activeCount}</span>
          )}
        </span>
        <span aria-hidden className={cx("transition-transform", open && "rotate-180")}>
          ▾
        </span>
      </button>
      {/* Applying filters on a phone closes the panel so the results are in view. */}
      <div id="trainer-filters" onSubmit={() => setOpen(false)} className={cx("mt-3 lg:mt-0 lg:block", !open && "hidden")}>
        {children}
      </div>
    </div>
  );
}
