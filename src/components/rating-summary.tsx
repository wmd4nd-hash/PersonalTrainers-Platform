import { reviewCountLabel } from "@/lib/reviews";
import { StarRating } from "./star-rating";

/** Compact star rating, e.g. "★★★★★ 4.8 (23)". Owned by the reviews feature. */
export function RatingSummary({ average, count }: { average: number; count: number }) {
  if (count === 0) return <span className="text-sm text-subtle">New</span>;
  const rounded = average.toFixed(1);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <StarRating value={average} size="sm" />
      <span aria-hidden="true" className="font-medium tabular-nums">
        {rounded}
      </span>
      <span aria-hidden="true" className="text-subtle tabular-nums">
        ({count})
      </span>
      <span className="sr-only">
        Rated {rounded} out of 5 from {reviewCountLabel(count)}
      </span>
    </span>
  );
}
