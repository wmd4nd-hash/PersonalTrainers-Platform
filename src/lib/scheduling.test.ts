import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  copyWindowsToDays,
  dateKey,
  describeTimeOff,
  findOverlappingWindow,
  formatDateKey,
  formatDuration,
  formatTimeOfDay,
  freeCancellationDeadline,
  generateSlots,
  isSlotAvailable,
  labelSlots,
  minuteOfDay,
  parseDateKey,
  parseTimeOfDay,
  reschedulePolicy,
  resolveWeek,
  sameWallTime,
  timeOffRange,
  upcomingDateKeys,
  weekdayOfKey,
  weeklyAvailabilityMinutes,
  zonedTime,
  type SlotOptions,
} from "./scheduling";

// Monday 2026-03-02 06:00 UTC
const now = new Date("2026-03-02T06:00:00Z");

function options(overrides: Partial<SlotOptions> = {}): SlotOptions {
  return {
    windows: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 }],
    busy: [],
    timezone: "UTC",
    sessionMinutes: 60,
    now,
    days: 1,
    minNoticeMinutes: 0,
    ...overrides,
  };
}

const iso = (slots: Date[]) => slots.map((s) => s.toISOString());

describe("generateSlots", () => {
  it("splits a window into back-to-back sessions", () => {
    expect(iso(generateSlots(options()))).toEqual([
      "2026-03-02T09:00:00.000Z",
      "2026-03-02T10:00:00.000Z",
      "2026-03-02T11:00:00.000Z",
    ]);
  });

  it("drops a trailing partial session", () => {
    const slots = generateSlots(options({ sessionMinutes: 45 }));
    expect(iso(slots)).toEqual([
      "2026-03-02T09:00:00.000Z",
      "2026-03-02T09:45:00.000Z",
      "2026-03-02T10:30:00.000Z",
      "2026-03-02T11:15:00.000Z",
    ]);
  });

  it("only uses windows for the matching weekday", () => {
    const slots = generateSlots(
      options({ windows: [{ dayOfWeek: 2, startMinute: 600, endMinute: 660 }], days: 7 }),
    );
    expect(iso(slots)).toEqual(["2026-03-03T10:00:00.000Z"]);
  });

  it("removes slots that overlap busy periods", () => {
    const slots = generateSlots(
      options({
        busy: [
          { startsAt: new Date("2026-03-02T10:30:00Z"), endsAt: new Date("2026-03-02T11:30:00Z") },
        ],
      }),
    );
    expect(iso(slots)).toEqual(["2026-03-02T09:00:00.000Z"]);
  });

  it("allows a slot that starts exactly when a busy period ends", () => {
    const slots = generateSlots(
      options({
        busy: [
          { startsAt: new Date("2026-03-02T09:00:00Z"), endsAt: new Date("2026-03-02T10:00:00Z") },
        ],
      }),
    );
    expect(iso(slots)).toContain("2026-03-02T10:00:00.000Z");
  });

  it("respects minimum notice", () => {
    const slots = generateSlots(
      options({ now: new Date("2026-03-02T08:30:00Z"), minNoticeMinutes: 120 }),
    );
    expect(iso(slots)).toEqual(["2026-03-02T11:00:00.000Z"]);
  });

  it("interprets windows in the trainer's timezone", () => {
    const slots = generateSlots(
      options({
        timezone: "America/New_York",
        windows: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 10 * 60 }],
      }),
    );
    // 09:00 EST is 14:00 UTC
    expect(iso(slots)).toEqual(["2026-03-02T14:00:00.000Z"]);
  });

  it("handles daylight saving changes", () => {
    // US clocks go forward on Sunday 2026-03-08.
    const slots = generateSlots(
      options({
        timezone: "America/New_York",
        windows: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 10 * 60 }],
        days: 8,
      }),
    );
    // Same local time, one hour earlier in UTC after the change.
    expect(iso(slots)).toEqual(["2026-03-02T14:00:00.000Z", "2026-03-09T13:00:00.000Z"]);
  });

  it("de-duplicates overlapping windows", () => {
    const slots = generateSlots(
      options({
        windows: [
          { dayOfWeek: 1, startMinute: 540, endMinute: 660 },
          { dayOfWeek: 1, startMinute: 600, endMinute: 720 },
        ],
      }),
    );
    expect(iso(slots)).toEqual([
      "2026-03-02T09:00:00.000Z",
      "2026-03-02T10:00:00.000Z",
      "2026-03-02T11:00:00.000Z",
    ]);
  });
});

describe("isSlotAvailable", () => {
  it("accepts a generated slot and rejects anything else", () => {
    expect(isSlotAvailable(new Date("2026-03-02T10:00:00Z"), options())).toBe(true);
    expect(isSlotAvailable(new Date("2026-03-02T10:15:00Z"), options())).toBe(false);
    expect(isSlotAvailable(new Date("2026-03-02T13:00:00Z"), options())).toBe(false);
  });
});

describe("time of day helpers", () => {
  it("parses and formats HH:MM", () => {
    expect(parseTimeOfDay("09:30")).toBe(570);
    expect(parseTimeOfDay("23:59")).toBe(1439);
    expect(parseTimeOfDay("24:00")).toBeNull();
    expect(parseTimeOfDay("9:30")).toBeNull();
    expect(formatTimeOfDay(570)).toBe("09:30");
  });
});

describe("time off", () => {
  // Monday 2026-03-02, with windows all week.
  const allWeek = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startMinute: 9 * 60, endMinute: 12 * 60 }));

  it("removes every slot on a day covered by all-day time off", () => {
    const off = timeOffRange(
      { startDate: "2026-03-03", endDate: "2026-03-03", allDay: true, startMinute: 0, endMinute: 1440 },
      "Europe/London",
    );
    const slots = generateSlots(
      options({ windows: allWeek, busy: [off], timezone: "Europe/London", days: 3 }),
    );
    const days = new Set(slots.map((s) => dateKey(s, "Europe/London")));
    expect(days.has("2026-03-02")).toBe(true);
    expect(days.has("2026-03-03")).toBe(false);
    expect(days.has("2026-03-04")).toBe(true);
  });

  it("removes only the slots that overlap part-day time off", () => {
    const off = timeOffRange(
      { startDate: "2026-03-02", endDate: "2026-03-02", allDay: false, startMinute: 9 * 60 + 30, endMinute: 10 * 60 + 30 },
      "UTC",
    );
    expect(iso(generateSlots(options({ busy: [off] })))).toEqual(["2026-03-02T11:00:00.000Z"]);
  });

  it("removes slots across multi-day time off in the trainer's timezone", () => {
    const off = timeOffRange(
      { startDate: "2026-03-03", endDate: "2026-03-05", allDay: true, startMinute: 0, endMinute: 1440 },
      "America/New_York",
    );
    const slots = generateSlots(
      options({ windows: allWeek, busy: [off], timezone: "America/New_York", days: 7 }),
    );
    const days = [...new Set(slots.map((s) => dateKey(s, "America/New_York")))];
    expect(days).toEqual(["2026-03-02", "2026-03-06", "2026-03-07", "2026-03-08"]);
  });

  it("converts all-day time off to local midnights", () => {
    const range = timeOffRange(
      { startDate: "2026-07-01", endDate: "2026-07-02", allDay: true, startMinute: 0, endMinute: 1440 },
      "Europe/London",
    );
    // BST is UTC+1
    expect(range.startsAt.toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(range.endsAt.toISOString()).toBe("2026-07-02T23:00:00.000Z");
  });

  it("handles time off spanning a daylight saving change", () => {
    const range = timeOffRange(
      { startDate: "2026-03-07", endDate: "2026-03-09", allDay: false, startMinute: 600, endMinute: 600 },
      "America/New_York",
    );
    expect(range.startsAt.toISOString()).toBe("2026-03-07T15:00:00.000Z"); // EST
    expect(range.endsAt.toISOString()).toBe("2026-03-09T14:00:00.000Z"); // EDT
  });

  it("describes time off in plain words", () => {
    const normalize = (s: string) => s.replace(/[  \s]+/g, " ");
    const single = timeOffRange(
      { startDate: "2026-10-22", endDate: "2026-10-22", allDay: true, startMinute: 0, endMinute: 1440 },
      "Europe/London",
    );
    expect(describeTimeOff(single.startsAt, single.endsAt, "Europe/London")).toBe("Thu, Oct 22 (all day)");
    const several = timeOffRange(
      { startDate: "2026-10-22", endDate: "2026-10-24", allDay: true, startMinute: 0, endMinute: 1440 },
      "Europe/London",
    );
    expect(describeTimeOff(several.startsAt, several.endsAt, "Europe/London")).toBe(
      "Thu, Oct 22 – Sat, Oct 24 (all day)",
    );
    const part = timeOffRange(
      { startDate: "2026-10-22", endDate: "2026-10-22", allDay: false, startMinute: 13 * 60, endMinute: 15 * 60 },
      "Europe/London",
    );
    expect(normalize(describeTimeOff(part.startsAt, part.endsAt, "Europe/London"))).toBe(
      "Thu, Oct 22, 1:00 – 3:00 PM",
    );
  });
});

describe("labelSlots", () => {
  it("labels each slot in the trainer's timezone", () => {
    const slot = new Date("2026-03-02T23:30:00Z");
    expect(labelSlots([slot], "Asia/Tokyo")).toEqual([
      { value: "2026-03-02T23:30:00.000Z", day: "Tuesday, Mar 3", time: "8:30 AM" },
    ]);
    expect(labelSlots([slot], "America/New_York")[0]).toMatchObject({ day: "Monday, Mar 2", time: "6:30 PM" });
  });
});

describe("date keys", () => {
  it("reads the local date in a timezone", () => {
    const instant = new Date("2026-03-02T23:30:00Z");
    expect(dateKey(instant, "UTC")).toBe("2026-03-02");
    expect(dateKey(instant, "Asia/Tokyo")).toBe("2026-03-03");
    expect(dateKey(instant, "America/Los_Angeles")).toBe("2026-03-02");
  });

  it("validates and shifts keys", () => {
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-2-3")).toBeNull();
    expect(parseDateKey("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOfKey("2026-03-02")).toBe(1);
  });

  it("finds wall-clock instants, including the following midnight", () => {
    expect(zonedTime("2026-03-02", 9 * 60, "America/New_York").toISOString()).toBe("2026-03-02T14:00:00.000Z");
    expect(zonedTime("2026-03-07", 1440, "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(minuteOfDay(new Date("2026-03-02T14:30:00Z"), "America/New_York")).toBe(9 * 60 + 30);
  });

  it("lists the booking horizon from today", () => {
    const keys = upcomingDateKeys(new Date("2026-03-02T23:30:00Z"), "Asia/Tokyo", 3);
    expect(keys).toEqual(["2026-03-03", "2026-03-04", "2026-03-05"]);
    expect(upcomingDateKeys(now, "UTC")).toHaveLength(28);
  });

  it("formats keys without shifting the date", () => {
    expect(formatDateKey("2026-03-02", { weekday: "long", month: "short", day: "numeric" })).toBe(
      "Monday, Mar 2",
    );
    expect(formatDateKey("2026-03-02", { day: "numeric" })).toBe("2");
  });

  it("compares wall-clock time across timezones", () => {
    const instant = new Date("2026-07-01T12:00:00Z");
    expect(sameWallTime(instant, "Europe/London", "Europe/Dublin")).toBe(true);
    expect(sameWallTime(instant, "Europe/London", "America/New_York")).toBe(false);
  });
});

describe("resolveWeek", () => {
  it("snaps any day to its Monday-to-Sunday week", () => {
    const week = resolveWeek("2026-03-05", now, "UTC");
    expect(week.key).toBe("2026-03-02");
    expect(week.days).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
    ]);
    expect(week.previousKey).toBe("2026-02-23");
    expect(week.nextKey).toBe("2026-03-09");
  });

  it("treats Sunday as the end of the week", () => {
    expect(resolveWeek("2026-03-08", now, "UTC").key).toBe("2026-03-02");
  });

  it("falls back to the current week for missing or invalid input", () => {
    expect(resolveWeek(undefined, now, "UTC").key).toBe("2026-03-02");
    expect(resolveWeek("next week", now, "UTC").key).toBe("2026-03-02");
  });

  it("starts and ends at local midnight across daylight saving", () => {
    const week = resolveWeek("2026-03-04", now, "America/New_York");
    expect(week.start.toISOString()).toBe("2026-03-02T05:00:00.000Z");
    // The week contains the switch to EDT, so it ends at 04:00 UTC.
    expect(week.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});

describe("weekly availability", () => {
  it("adds up hours, counting overlaps once", () => {
    expect(
      weeklyAvailabilityMinutes([
        { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
        { dayOfWeek: 1, startMinute: 660, endMinute: 780 },
        { dayOfWeek: 2, startMinute: 540, endMinute: 600 },
      ]),
    ).toBe(240 + 60);
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(37 * 60 + 30)).toBe("37.5 hours");
  });

  it("detects overlapping windows on the same day", () => {
    const existing = [{ id: "a", dayOfWeek: 1, startMinute: 540, endMinute: 720 }];
    expect(findOverlappingWindow(existing, { dayOfWeek: 1, startMinute: 600, endMinute: 800 })?.id).toBe("a");
    expect(findOverlappingWindow(existing, { dayOfWeek: 1, startMinute: 480, endMinute: 1000 })?.id).toBe("a");
    // Touching is fine, and other days don't count.
    expect(findOverlappingWindow(existing, { dayOfWeek: 1, startMinute: 720, endMinute: 800 })).toBeUndefined();
    expect(findOverlappingWindow(existing, { dayOfWeek: 2, startMinute: 600, endMinute: 700 })).toBeUndefined();
  });

  it("copies one day's windows to the other weekdays", () => {
    const copies = copyWindowsToDays(
      [
        { dayOfWeek: 1, startMinute: 420, endMinute: 720 },
        { dayOfWeek: 1, startMinute: 960, endMinute: 1140 },
        { dayOfWeek: 3, startMinute: 0, endMinute: 60 },
      ],
      1,
      [1, 2, 3, 4, 5],
    );
    expect(copies).toHaveLength(8);
    expect(copies.filter((w) => w.dayOfWeek === 3)).toEqual([
      { dayOfWeek: 3, startMinute: 420, endMinute: 720 },
      { dayOfWeek: 3, startMinute: 960, endMinute: 1140 },
    ]);
    expect(copies.some((w) => w.dayOfWeek === 1)).toBe(false);
  });
});

describe("reschedulePolicy", () => {
  const startsAt = new Date("2026-03-05T10:00:00Z");
  const base = { startsAt, windowHours: 24 };

  it("lets clients move a session outside the cancellation window", () => {
    expect(reschedulePolicy({ ...base, actor: "CLIENT", now: new Date("2026-03-04T09:59:00Z") })).toEqual({
      allowed: true,
    });
  });

  it("stops clients inside the cancellation window", () => {
    const decision = reschedulePolicy({ ...base, actor: "CLIENT", now: new Date("2026-03-04T10:01:00Z") });
    expect(decision.allowed).toBe(false);
  });

  it("lets clients move any time before a session when the trainer has no window", () => {
    expect(reschedulePolicy({ ...base, windowHours: 0, actor: "CLIENT", now: new Date("2026-03-05T09:59:00Z") }).allowed).toBe(
      true,
    );
  });

  it("lets trainers move a session any time before it starts", () => {
    expect(reschedulePolicy({ ...base, actor: "TRAINER", now: new Date("2026-03-05T09:59:00Z") }).allowed).toBe(true);
    expect(reschedulePolicy({ ...base, actor: "TRAINER", now: new Date("2026-03-05T10:00:00Z") }).allowed).toBe(false);
  });

  it("computes the free cancellation deadline", () => {
    expect(freeCancellationDeadline(startsAt, 24).toISOString()).toBe("2026-03-04T10:00:00.000Z");
  });
});
