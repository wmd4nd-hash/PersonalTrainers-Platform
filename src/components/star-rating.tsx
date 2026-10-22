import { cx } from "./ui";

const sizes = {
  sm: "size-4",
  md: "size-5",
  lg: "size-7",
  xl: "size-9",
};

export type StarSize = keyof typeof sizes;

export function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={cx("block shrink-0", className)}>
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.47L12 17.47l-5.8 3.05 1.1-6.47-4.7-4.6 6.5-.95L12 2.6z" />
    </svg>
  );
}

/**
 * Read-only row of five stars with partial fill, e.g. 4.3 shows four full stars
 * and a third of the fifth. Pass `label` to announce it; otherwise it's decorative.
 */
export function StarRating({
  value,
  size = "md",
  label,
  className,
}: {
  value: number;
  size?: StarSize;
  label?: string;
  className?: string;
}) {
  const a11y = label ? ({ role: "img", "aria-label": label } as const) : ({ "aria-hidden": true } as const);
  return (
    <span className={cx("inline-flex items-center gap-0.5", className)} {...a11y}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.min(1, Math.max(0, value - (star - 1)));
        return (
          <span key={star} className={cx("relative inline-block shrink-0", sizes[size])}>
            <StarIcon className={cx("text-line", sizes[size])} />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <StarIcon className={cx("text-amber-500", sizes[size])} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
