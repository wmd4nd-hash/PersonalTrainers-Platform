import { reviewCountLabel, type RatingSummaryData } from "@/lib/reviews";
import { StarRating } from "./star-rating";

/** Average, star row, review count and 5-to-1 distribution bars. */
export function RatingBreakdown({ summary }: { summary: RatingSummaryData }) {
  const rounded = summary.average.toFixed(1);
  return (
    <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
      <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-1">
        <p className="text-4xl font-semibold tracking-tight tabular-nums">{rounded}</p>
        <div className="space-y-1">
          <StarRating value={summary.average} label={`Rated ${rounded} out of 5`} />
          <p className="text-sm text-subtle" data-testid="review-count">
            {reviewCountLabel(summary.count)}
          </p>
        </div>
      </div>
      <ul className="space-y-1.5" aria-label="Rating breakdown">
        {summary.distribution.map((row) => (
          <li key={row.rating} className="flex items-center gap-3 text-sm">
            <span aria-hidden="true" className="w-7 shrink-0 tabular-nums">
              {row.rating}
              <span className="text-amber-500">★</span>
            </span>
            <span aria-hidden="true" className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-amber-500" style={{ width: `${row.percent}%` }} />
            </span>
            <span aria-hidden="true" className="w-8 shrink-0 text-right text-subtle tabular-nums">
              {row.count}
            </span>
            <span className="sr-only">
              {row.rating} {row.rating === 1 ? "star" : "stars"}: {reviewCountLabel(row.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
