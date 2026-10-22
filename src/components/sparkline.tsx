/**
 * A tiny inline line chart for a series of values, oldest first. Pure SVG, no
 * client JavaScript. The line uses the current text colour.
 */
export function Sparkline({
  values,
  label,
  width = 120,
  height = 32,
  className,
}: {
  values: number[];
  /** Describes the trend for screen readers, e.g. "Weight from 40 kg to 52.5 kg". */
  label: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const points = sparklinePoints(values, width, height);
  const last = points.at(-1);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
    >
      <title>{label}</title>
      {points.length > 1 && (
        <polyline
          points={points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {last && <circle cx={last[0]} cy={last[1]} r={2.5} fill="currentColor" />}
    </svg>
  );
}

/**
 * Maps values to [x, y] coordinates inside the box, leaving room for the end
 * dot. A flat series sits in the middle; higher values are nearer the top.
 */
export function sparklinePoints(values: number[], width: number, height: number, pad = 3): [number, number][] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const round = (n: number) => Math.round(n * 100) / 100;

  return values.map((value, i) => {
    const x = values.length === 1 ? width / 2 : pad + (innerW * i) / (values.length - 1);
    const y = span === 0 ? height / 2 : pad + innerH * (1 - (value - min) / span);
    return [round(x), round(y)];
  });
}
