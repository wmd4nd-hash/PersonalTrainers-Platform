/** Display helpers for the inbox and thread. Pure, so they run on server and client alike. */

const DAY_MS = 86_400_000;

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day of `date` in `timeZone`, as "YYYY-MM-DD". */
export function dayKey(date: Date, timeZone: string): string {
  let formatter = dayKeyFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayKeyFormatters.set(timeZone, formatter);
  }
  return formatter.format(date);
}

/** Whole calendar days from `date` to `now` in `timeZone` (0 = same day). */
export function daysAgo(date: Date, now: Date, timeZone: string): number {
  const toUtc = (key: string) => Date.parse(`${key}T00:00:00Z`);
  return Math.round((toUtc(dayKey(now, timeZone)) - toUtc(dayKey(date, timeZone))) / DAY_MS);
}

function format(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
}

/** "9:05 AM" */
export function timeLabel(date: Date, timeZone: string): string {
  return format(date, timeZone, { hour: "numeric", minute: "2-digit" });
}

/** Day separator in a thread: "Today", "Yesterday", "Monday", "Wed, Oct 1" or "Oct 1, 2025". */
export function dayLabel(date: Date, now: Date, timeZone: string): string {
  const days = daysAgo(date, now, timeZone);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return format(date, timeZone, { weekday: "long" });
  if (dayKey(date, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4)) {
    return format(date, timeZone, { weekday: "short", month: "short", day: "numeric" });
  }
  return format(date, timeZone, { month: "short", day: "numeric", year: "numeric" });
}

/** Compact time for an inbox row: "9:05 AM", "Yesterday", "Mon", "Oct 1" or "Oct 1, 2025". */
export function inboxTimeLabel(date: Date, now: Date, timeZone: string): string {
  const days = daysAgo(date, now, timeZone);
  if (days <= 0) return timeLabel(date, timeZone);
  if (days === 1) return "Yesterday";
  if (days < 7) return format(date, timeZone, { weekday: "short" });
  if (dayKey(date, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4)) {
    return format(date, timeZone, { month: "short", day: "numeric" });
  }
  return format(date, timeZone, { month: "short", day: "numeric", year: "numeric" });
}

export type DayGroup<T> = { key: string; date: Date; items: T[] };

/** Splits time-ordered items into one group per calendar day in `timeZone`. */
export function groupByDay<T extends { createdAt: string }>(items: T[], timeZone: string): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = dayKey(date, timeZone);
    const current = groups.at(-1);
    if (current?.key === key) current.items.push(item);
    else groups.push({ key, date, items: [item] });
  }
  return groups;
}

/** One-line preview of a message body. */
export function previewText(body: string, max = 90): string {
  const line = body.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trimEnd()}…`;
}
