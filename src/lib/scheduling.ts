import { TZDate } from "@date-fns/tz";
import { addDays, addMinutes, startOfDay } from "date-fns";

export type AvailabilityWindow = {
  /** 0 = Sunday … 6 = Saturday, in the trainer's timezone */
  dayOfWeek: number;
  /** Minutes since local midnight */
  startMinute: number;
  endMinute: number;
};

export type BusyPeriod = { startsAt: Date; endsAt: Date };

export type SlotOptions = {
  windows: AvailabilityWindow[];
  busy: BusyPeriod[];
  timezone: string;
  sessionMinutes: number;
  /** The current time. */
  now: Date;
  /** How many local days ahead to offer, starting today. */
  days?: number;
  /** Earliest a session can start, measured from `now`. */
  minNoticeMinutes?: number;
};

export const BOOKING_HORIZON_DAYS = 28;
// Longer than the Stripe Checkout lifetime (31 min), so a hold never lapses before checkout does.
export const PAYMENT_HOLD_MINUTES = 35;
export const CHECKOUT_EXPIRY_MINUTES = 31;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Bookable session start times, sorted ascending. */
export function generateSlots({
  windows,
  busy,
  timezone,
  sessionMinutes,
  now,
  days = BOOKING_HORIZON_DAYS,
  minNoticeMinutes = 120,
}: SlotOptions): Date[] {
  if (sessionMinutes <= 0) return [];
  const earliest = addMinutes(now, minNoticeMinutes).getTime();
  const today = startOfDay(new TZDate(now, timezone));
  const slots: Date[] = [];

  for (let offset = 0; offset < days; offset++) {
    const day = addDays(today, offset);
    const dayWindows = windows.filter((w) => w.dayOfWeek === day.getDay());

    for (const window of dayWindows) {
      for (
        let minute = window.startMinute;
        minute + sessionMinutes <= window.endMinute;
        minute += sessionMinutes
      ) {
        const start = new TZDate(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          Math.floor(minute / 60),
          minute % 60,
          timezone,
        );
        const startMs = start.getTime();
        const endMs = startMs + sessionMinutes * 60_000;
        if (startMs < earliest) continue;
        const clashes = busy.some(
          (b) => startMs < b.endsAt.getTime() && endMs > b.startsAt.getTime(),
        );
        if (!clashes) slots.push(new Date(startMs));
      }
    }
  }

  // Windows may overlap; keep each start time once.
  const unique = [...new Set(slots.map((s) => s.getTime()))];
  return unique.sort((a, b) => a - b).map((ms) => new Date(ms));
}

export function isSlotAvailable(slot: Date, options: SlotOptions): boolean {
  return generateSlots(options).some((s) => s.getTime() === slot.getTime());
}

/** "09:30" -> 570, or null if malformed. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 570 -> "09:30" */
export function formatTimeOfDay(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatSlot(slot: Date, timezone: string, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(slot);
}

export type LabelledSlot = {
  /** ISO start time. */
  value: string;
  /** Day in the timezone, e.g. "Thursday, Oct 22". */
  day: string;
  /** Start time in the timezone, e.g. "9:00 AM". */
  time: string;
};

/** Slot start times with day and time labels for pickers, in the trainer's timezone. */
export function labelSlots(slots: Date[], timezone: string, locale = "en-US"): LabelledSlot[] {
  const day = new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: "long", month: "short", day: "numeric" });
  const time = new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: "numeric", minute: "2-digit" });
  return slots.map((slot) => ({ value: slot.toISOString(), day: day.format(slot), time: time.format(slot) }));
}

/** "Tue, Oct 22, 9:00 – 10:00 AM GMT+1" */
export function formatSlotRange(start: Date, end: Date, timezone: string, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatRange(start, end);
}

// ---------------------------------------------------------------------------
// Calendar dates. A "date key" is a local calendar date written YYYY-MM-DD.
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar date of `instant` in `timezone`, as YYYY-MM-DD. */
export function dateKey(instant: Date, timezone: string): string {
  const local = new TZDate(instant, timezone);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

/** Parses YYYY-MM-DD, or returns null if it isn't a real date. */
export function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** Moves a date key by whole days, e.g. ("2026-10-31", 1) -> "2026-11-01". */
export function addDaysToKey(key: string, days: number): string {
  const parts = parseDateKey(key);
  if (!parts) throw new Error(`Invalid date key: ${key}`);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return date.toISOString().slice(0, 10);
}

/** Day of the week (0 = Sunday) of a date key. */
export function weekdayOfKey(key: string): number {
  const parts = parseDateKey(key);
  if (!parts) throw new Error(`Invalid date key: ${key}`);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/**
 * The instant of a wall-clock time on a local date. `minute` is minutes since
 * local midnight; 1440 means the following midnight.
 */
export function zonedTime(key: string, minute: number, timezone: string): Date {
  const parts = parseDateKey(key);
  if (!parts) throw new Error(`Invalid date key: ${key}`);
  const midnight = new TZDate(parts.year, parts.month - 1, parts.day, timezone);
  const day = addDays(midnight, Math.floor(minute / 1440));
  const rest = minute % 1440;
  return new Date(
    new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(rest / 60), rest % 60, timezone).getTime(),
  );
}

/** Minutes since local midnight of `instant` in `timezone`. */
export function minuteOfDay(instant: Date, timezone: string): number {
  const local = new TZDate(instant, timezone);
  return local.getHours() * 60 + local.getMinutes();
}

/** The next `days` local dates in `timezone`, starting today. */
export function upcomingDateKeys(now: Date, timezone: string, days = BOOKING_HORIZON_DAYS): string[] {
  const today = dateKey(now, timezone);
  return Array.from({ length: days }, (_, i) => addDaysToKey(today, i));
}

/** Formats a date key without any timezone shifts, e.g. { weekday: "short" } -> "Tue". */
export function formatDateKey(key: string, options: Intl.DateTimeFormatOptions, locale = "en-US") {
  const parts = parseDateKey(key);
  if (!parts) return key;
  const noonUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(noonUtc);
}

/** True when the instant reads the same on a clock in both timezones. */
export function sameWallTime(instant: Date, timezoneA: string, timezoneB: string): boolean {
  if (timezoneA === timezoneB) return true;
  const a = new TZDate(instant, timezoneA);
  const b = new TZDate(instant, timezoneB);
  return a.getDate() === b.getDate() && a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
}

export type Week = {
  /** Monday 00:00 in the timezone. */
  start: Date;
  /** The following Monday 00:00. */
  end: Date;
  /** The Monday as YYYY-MM-DD, used in ?week= links. */
  key: string;
  previousKey: string;
  nextKey: string;
  /** Monday to Sunday as date keys. */
  days: string[];
};

/** The Monday-to-Sunday week containing `key` (or today when missing or invalid). */
export function resolveWeek(key: string | undefined, now: Date, timezone: string): Week {
  const anchor = key && parseDateKey(key) ? key : dateKey(now, timezone);
  const mondayOffset = (weekdayOfKey(anchor) + 6) % 7;
  const monday = addDaysToKey(anchor, -mondayOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
  return {
    start: zonedTime(monday, 0, timezone),
    end: zonedTime(addDaysToKey(monday, 7), 0, timezone),
    key: monday,
    previousKey: addDaysToKey(monday, -7),
    nextKey: addDaysToKey(monday, 7),
    days,
  };
}

// ---------------------------------------------------------------------------
// Weekly availability
// ---------------------------------------------------------------------------

/** Merges overlapping or touching [start, end) intervals. */
export function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Bookable minutes per week, counting overlapping windows once. */
export function weeklyAvailabilityMinutes(windows: AvailabilityWindow[]): number {
  let total = 0;
  for (let day = 0; day < 7; day++) {
    const intervals = windows
      .filter((w) => w.dayOfWeek === day)
      .map((w): [number, number] => [w.startMinute, w.endMinute]);
    total += mergeIntervals(intervals).reduce((sum, [start, end]) => sum + (end - start), 0);
  }
  return total;
}

/** "37.5 hours", "1 hour", "45 minutes" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** An existing window on the same day that overlaps the candidate. Touching windows don't overlap. */
export function findOverlappingWindow<W extends AvailabilityWindow>(
  existing: W[],
  candidate: AvailabilityWindow,
): W | undefined {
  return existing.find(
    (w) =>
      w.dayOfWeek === candidate.dayOfWeek &&
      candidate.startMinute < w.endMinute &&
      candidate.endMinute > w.startMinute,
  );
}

/** Copies one day's windows onto each target day (the source day itself is skipped). */
export function copyWindowsToDays(
  windows: AvailabilityWindow[],
  sourceDay: number,
  targetDays: number[],
): AvailabilityWindow[] {
  const source = windows.filter((w) => w.dayOfWeek === sourceDay);
  return targetDays
    .filter((day) => day !== sourceDay)
    .flatMap((dayOfWeek) =>
      source.map((w) => ({ dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute })),
    );
}

export const WEEKDAYS = [1, 2, 3, 4, 5] as const;

/** Monday first, the way the week is shown in the dashboard. */
export const DISPLAY_WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

export type TimeOffInput = {
  startDate: string;
  endDate: string;
  allDay: boolean;
  /** Ignored for all-day time off. */
  startMinute: number;
  endMinute: number;
};

/**
 * Turns dates and times entered in the trainer's timezone into instants.
 * All-day time off runs from midnight on the start date to midnight after the end date.
 */
export function timeOffRange(input: TimeOffInput, timezone: string): { startsAt: Date; endsAt: Date } {
  if (input.allDay) {
    return {
      startsAt: zonedTime(input.startDate, 0, timezone),
      endsAt: zonedTime(input.endDate, 1440, timezone),
    };
  }
  return {
    startsAt: zonedTime(input.startDate, input.startMinute, timezone),
    endsAt: zonedTime(input.endDate, input.endMinute, timezone),
  };
}

/** "Thu, Oct 22 (all day)", "Thu, Oct 22 – Sat, Oct 24 (all day)" or "Thu, Oct 22, 1:00 – 3:00 PM" */
export function describeTimeOff(startsAt: Date, endsAt: Date, timezone: string, locale = "en-US"): string {
  const allDay = minuteOfDay(startsAt, timezone) === 0 && minuteOfDay(endsAt, timezone) === 0;
  if (allDay) {
    const first = dateKey(startsAt, timezone);
    const last = addDaysToKey(dateKey(endsAt, timezone), -1);
    const label = (key: string) => formatDateKey(key, { weekday: "short", month: "short", day: "numeric" }, locale);
    return first === last ? `${label(first)} (all day)` : `${label(first)} – ${label(last)} (all day)`;
  }
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).formatRange(startsAt, endsAt);
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

export type RescheduleDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Trainers can move a session any time before it starts. Clients can move it
 * only outside the trainer's cancellation window, so a late change can't be
 * used to dodge the late-cancellation fee or leave the trainer with a gap.
 */
export function reschedulePolicy({
  actor,
  startsAt,
  now,
  windowHours,
}: {
  actor: "CLIENT" | "TRAINER";
  startsAt: Date;
  now: Date;
  windowHours: number;
}): RescheduleDecision {
  if (startsAt.getTime() <= now.getTime()) {
    return { allowed: false, reason: "This session has already started, so it can't be moved." };
  }
  if (actor === "CLIENT") {
    const hoursAhead = (startsAt.getTime() - now.getTime()) / 3_600_000;
    if (hoursAhead < windowHours) {
      return {
        allowed: false,
        reason: `Sessions can be moved up to ${windowHours} hours before they start. Message your trainer if you need to change this one.`,
      };
    }
  }
  return { allowed: true };
}

/** The last moment a client can reschedule (and, when there is a late fee, cancel for free). */
export function freeCancellationDeadline(startsAt: Date, windowHours: number): Date {
  return addMinutes(startsAt, -windowHours * 60);
}
