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
