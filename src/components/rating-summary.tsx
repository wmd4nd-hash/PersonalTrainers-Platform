/** Compact star rating, e.g. "★ 4.8 (23)". Owned by the reviews feature. */
export function RatingSummary({ average, count }: { average: number; count: number }) {
  if (count === 0) return <span className="text-sm text-subtle">New</span>;
  return (
    <span className="text-sm" aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} reviews`}>
      <span className="text-amber-500">★</span> {average.toFixed(1)}{" "}
      <span className="text-subtle">({count})</span>
    </span>
  );
}
