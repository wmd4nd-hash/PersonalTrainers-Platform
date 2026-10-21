"use client";

import { useMemo, useState } from "react";
import { dateKey, formatDateKey, sameWallTime } from "@/lib/scheduling";
import { cx } from "../ui";
import { useViewerTimezone } from "./local-time";

export type PickerSlot = {
  /** ISO start time. */
  value: string;
  /** Start time in the trainer's timezone, e.g. "9:00 AM". */
  time: string;
  /** Day label in the trainer's timezone, e.g. "Tuesday, Oct 22". */
  day: string;
};

type PickerDay = {
  key: string;
  weekday: string;
  dayOfMonth: string;
  month: string;
  /** Spoken label, e.g. "Tuesday, October 22". */
  label: string;
  slots: PickerSlot[];
};

/**
 * Groups slots by day. With a timezone, days are real dates in that timezone
 * and `dates` adds the days without free times; without one, the slots' day
 * labels are used as they are.
 */
function groupByDay(slots: PickerSlot[], timezone?: string, dates?: string[]): PickerDay[] {
  const byDay = new Map<string, PickerSlot[]>();
  if (timezone) for (const key of dates ?? []) byDay.set(key, []);
  for (const slot of slots) {
    const key = timezone ? dateKey(new Date(slot.value), timezone) : slot.day;
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }
  const keys = [...byDay.keys()];
  if (timezone) keys.sort();
  return keys.map((key) =>
    timezone
      ? {
          key,
          weekday: formatDateKey(key, { weekday: "short" }),
          dayOfMonth: formatDateKey(key, { day: "numeric" }),
          month: formatDateKey(key, { month: "short" }),
          label: formatDateKey(key, { weekday: "long", month: "long", day: "numeric" }),
          slots: byDay.get(key)!,
        }
      : { key, weekday: "", dayOfMonth: key, month: "", label: key, slots: byDay.get(key)! },
  );
}

/**
 * Choose a day from a scrollable strip, then a start time. Times are shown in
 * the trainer's timezone, with the viewer's own time underneath when it differs.
 */
export function SlotPicker({
  slots,
  timezone,
  dates,
  selected,
  onSelect,
  error,
}: {
  slots: PickerSlot[];
  /** The trainer's timezone. */
  timezone?: string;
  /** Every date to show in the strip (YYYY-MM-DD in the trainer's timezone). */
  dates?: string[];
  selected?: string;
  onSelect: (value: string | undefined) => void;
  error?: string;
}) {
  const days = useMemo(() => groupByDay(slots, timezone, dates), [slots, timezone, dates]);
  const [dayKey, setDayKey] = useState(
    () => days.find((d) => d.slots.some((s) => s.value === selected))?.key ?? days.find((d) => d.slots.length > 0)?.key,
  );
  const day = days.find((d) => d.key === dayKey);
  const viewerTimezone = useViewerTimezone();
  const showLocal =
    Boolean(timezone && viewerTimezone) &&
    slots.some((s) => !sameWallTime(new Date(s.value), timezone!, viewerTimezone!));

  const localTime = (slot: PickerSlot) => {
    const instant = new Date(slot.value);
    const otherDay = dateKey(instant, viewerTimezone!) !== dateKey(instant, timezone!);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: viewerTimezone!,
      weekday: otherDay ? "short" : undefined,
      hour: "numeric",
      minute: "2-digit",
    }).format(instant);
  };

  return (
    <div className="min-w-0 space-y-4">
      {/* min-w-0 and inline-size containment keep the long day strip from widening the page on phones. */}
      <fieldset className="min-w-0">
        <legend className="mb-1 text-sm font-medium">Day</legend>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pt-1 pb-2 [contain:inline-size]">
          {days.map((d) => {
            const count = d.slots.length;
            return (
              <label
                key={d.key}
                className={cx(
                  // relative: keeps the visually hidden radio inside the scrolling strip.
                  "relative flex w-16 shrink-0 snap-start flex-col items-center rounded-lg border border-line px-1 py-2 text-center",
                  count > 0 ? "cursor-pointer hover:border-brand" : "cursor-not-allowed opacity-45",
                  "has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-white",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
                )}
              >
                <input
                  type="radio"
                  name="day"
                  value={d.key}
                  checked={dayKey === d.key}
                  disabled={count === 0}
                  onChange={() => {
                    setDayKey(d.key);
                    onSelect(undefined);
                  }}
                  aria-label={`${d.label}, ${count === 0 ? "no free times" : `${count} free time${count === 1 ? "" : "s"}`}`}
                  className="sr-only"
                />
                {d.weekday && <span className="text-xs">{d.weekday}</span>}
                <span className={cx("font-semibold leading-tight", d.weekday ? "text-lg" : "text-xs")}>
                  {d.dayOfMonth}
                </span>
                {d.month && <span className="text-xs">{d.month}</span>}
                <span className="mt-1 text-[11px] leading-tight">{count === 0 ? "None" : `${count} free`}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-1 text-sm font-medium">
          Time{day && <span className="font-normal text-subtle"> · {day.label}</span>}
        </legend>
        {showLocal && (
          <p className="mb-2 text-xs text-subtle">
            Times are in {timezone}. The smaller time underneath is yours ({viewerTimezone}).
          </p>
        )}
        {day && day.slots.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {day.slots.map((slot) => {
              const local = showLocal && !sameWallTime(new Date(slot.value), timezone!, viewerTimezone!);
              return (
                <button
                  key={slot.value}
                  type="button"
                  aria-pressed={selected === slot.value}
                  onClick={() => onSelect(slot.value)}
                  className={cx(
                    "rounded-lg border px-2 py-1.5 text-sm",
                    selected === slot.value ? "border-brand bg-brand text-white" : "border-line hover:border-brand",
                  )}
                >
                  <span className="block">{slot.time}</span>
                  {local && (
                    <span className="block text-[11px] leading-tight opacity-75">
                      {localTime(slot)}
                      <span className="sr-only"> your time</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-subtle">No free times on this day.</p>
        )}
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </fieldset>
    </div>
  );
}
