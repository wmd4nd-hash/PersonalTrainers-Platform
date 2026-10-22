import {
  dateKey,
  mergeIntervals,
  minuteOfDay,
  weekdayOfKey,
  zonedTime,
  addDaysToKey,
  type AvailabilityWindow,
} from "@/lib/scheduling";

/** Height of one hour in the week grid. */
export const HOUR_PX = 48;

export type Interval = { startsAt: Date; endsAt: Date };

export type Placed<T> = T & {
  /** Minutes since local midnight, clipped to this day (0-1440). */
  startMinute: number;
  endMinute: number;
  /** Started on an earlier day / runs into the next day. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Side-by-side position when items overlap: lane index out of `lanes`. */
  lane: number;
  lanes: number;
};

export type CalendarDay<B, T> = {
  key: string;
  isToday: boolean;
  /** Availability for this weekday, merged. */
  open: { startMinute: number; endMinute: number }[];
  bookings: Placed<B>[];
  timeOff: Placed<T>[];
};

/** Puts overlapping items side by side. Items are placed in start order. */
export function assignLanes<T extends { startMinute: number; endMinute: number }>(
  items: T[],
): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  const result: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  // A cluster is a run of items that overlap each other directly or through a chain.
  const closeCluster = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    result.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMinute >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= item.startMinute);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.endMinute;
    cluster.push({ ...item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.endMinute);
  }
  if (cluster.length > 0) closeCluster();
  return result;
}

function clipToDay<I extends Interval>(item: I, dayStart: Date, dayEnd: Date, timezone: string) {
  if (item.endsAt <= dayStart || item.startsAt >= dayEnd) return null;
  const continuesBefore = item.startsAt < dayStart;
  const continuesAfter = item.endsAt > dayEnd;
  const startMinute = continuesBefore ? 0 : minuteOfDay(item.startsAt, timezone);
  const endMinute = continuesAfter || item.endsAt.getTime() === dayEnd.getTime() ? 1440 : minuteOfDay(item.endsAt, timezone);
  return { ...item, startMinute, endMinute: Math.max(endMinute, startMinute), continuesBefore, continuesAfter };
}

/** Lays out a Monday-to-Sunday week in the trainer's timezone. */
export function buildWeek<B extends Interval, T extends Interval>({
  days,
  timezone,
  windows,
  bookings,
  timeOff,
  now,
}: {
  /** Seven date keys, Monday first. */
  days: string[];
  timezone: string;
  windows: AvailabilityWindow[];
  bookings: B[];
  timeOff: T[];
  now: Date;
}): CalendarDay<B, T>[] {
  const today = dateKey(now, timezone);
  return days.map((key) => {
    const dayStart = zonedTime(key, 0, timezone);
    const dayEnd = zonedTime(addDaysToKey(key, 1), 0, timezone);
    const weekday = weekdayOfKey(key);
    const open = mergeIntervals(
      windows.filter((w) => w.dayOfWeek === weekday).map((w): [number, number] => [w.startMinute, w.endMinute]),
    ).map(([startMinute, endMinute]) => ({ startMinute, endMinute }));

    const dayBookings = bookings
      .map((b) => clipToDay(b, dayStart, dayEnd, timezone))
      .filter((b) => b !== null);
    const dayTimeOff = timeOff
      .map((t) => clipToDay(t, dayStart, dayEnd, timezone))
      .filter((t) => t !== null);

    return {
      key,
      isToday: key === today,
      open,
      bookings: assignLanes(dayBookings),
      timeOff: dayTimeOff.map((t) => ({ ...t, lane: 0, lanes: 1 })),
    };
  });
}

/**
 * Hours shown in the grid: working hours by default, widened to fit every
 * availability window and booking. Time off alone doesn't widen it.
 */
export function visibleRange(
  days: CalendarDay<Interval, Interval>[],
  fallback = { startMinute: 8 * 60, endMinute: 18 * 60 },
): { startMinute: number; endMinute: number } {
  let start = fallback.startMinute;
  let end = fallback.endMinute;
  for (const day of days) {
    for (const item of [...day.open, ...day.bookings]) {
      start = Math.min(start, item.startMinute);
      end = Math.max(end, item.endMinute);
    }
  }
  return { startMinute: Math.floor(start / 60) * 60, endMinute: Math.min(1440, Math.ceil(end / 60) * 60) };
}

/** CSS top/height for an item, clipped to the visible range; null when it's outside it. */
export function blockPosition(
  item: { startMinute: number; endMinute: number },
  range: { startMinute: number; endMinute: number },
): { top: number; height: number } | null {
  const start = Math.max(item.startMinute, range.startMinute);
  const end = Math.min(item.endMinute, range.endMinute);
  if (end <= start) return null;
  return {
    top: ((start - range.startMinute) / 60) * HOUR_PX,
    height: ((end - start) / 60) * HOUR_PX,
  };
}

const clockFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
const hourFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" });
const atMinute = (minute: number) => new Date(Date.UTC(2000, 0, 1, 0, minute));

/** Minutes since midnight as a clock time: 810 -> "1:30 PM". 1440 reads as "midnight". */
export function formatMinute(minute: number): string {
  if (minute === 1440) return "midnight";
  return clockFormat.format(atMinute(minute));
}

/** Hour labels for the grid's side: 420 -> "7 AM". */
export function formatHour(minute: number): string {
  return hourFormat.format(atMinute(minute));
}

/** "All day", or "1:00 PM – 3:00 PM" for part of the day. */
export function describeSpan(item: { startMinute: number; endMinute: number }): string {
  if (item.startMinute === 0 && item.endMinute === 1440) return "All day";
  return `${formatMinute(item.startMinute)} – ${formatMinute(item.endMinute)}`;
}
