import { describe, expect, it } from "vitest";
import { resolveWeek } from "@/lib/scheduling";
import {
  assignLanes,
  blockPosition,
  buildWeek,
  describeSpan,
  formatHour,
  formatMinute,
  HOUR_PX,
  visibleRange,
} from "./week";

const now = new Date("2026-03-04T12:00:00Z"); // Wednesday
const week = resolveWeek("2026-03-02", now, "UTC");

describe("buildWeek", () => {
  const days = buildWeek({
    days: week.days,
    timezone: "UTC",
    windows: [
      { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
      { dayOfWeek: 1, startMinute: 700, endMinute: 780 },
    ],
    bookings: [
      { id: "b1", startsAt: new Date("2026-03-02T09:00:00Z"), endsAt: new Date("2026-03-02T10:00:00Z") },
    ],
    timeOff: [
      // Thursday 18:00 to Saturday 00:00
      { id: "t1", startsAt: new Date("2026-03-05T18:00:00Z"), endsAt: new Date("2026-03-07T00:00:00Z") },
    ],
    now,
  });

  it("returns Monday to Sunday and marks today", () => {
    expect(days.map((d) => d.key)).toEqual(week.days);
    expect(days.filter((d) => d.isToday).map((d) => d.key)).toEqual(["2026-03-04"]);
  });

  it("merges availability windows per weekday", () => {
    expect(days[0]!.open).toEqual([{ startMinute: 540, endMinute: 780 }]);
    expect(days[1]!.open).toEqual([]);
  });

  it("places bookings by local minutes", () => {
    expect(days[0]!.bookings).toMatchObject([{ id: "b1", startMinute: 540, endMinute: 600, lane: 0, lanes: 1 }]);
  });

  it("splits time off across the days it covers", () => {
    expect(days[3]!.timeOff).toMatchObject([
      { id: "t1", startMinute: 1080, endMinute: 1440, continuesBefore: false, continuesAfter: true },
    ]);
    expect(days[4]!.timeOff).toMatchObject([
      { id: "t1", startMinute: 0, endMinute: 1440, continuesBefore: true, continuesAfter: false },
    ]);
    expect(days[5]!.timeOff).toEqual([]);
  });

  it("uses the trainer's timezone for columns", () => {
    const tokyo = buildWeek({
      days: resolveWeek("2026-03-02", now, "Asia/Tokyo").days,
      timezone: "Asia/Tokyo",
      windows: [],
      // 2026-03-02 23:00 UTC is Tuesday 08:00 in Tokyo
      bookings: [{ id: "b2", startsAt: new Date("2026-03-02T23:00:00Z"), endsAt: new Date("2026-03-03T00:00:00Z") }],
      timeOff: [],
      now,
    });
    expect(tokyo[1]!.bookings).toMatchObject([{ id: "b2", startMinute: 480, endMinute: 540 }]);
    expect(tokyo[0]!.bookings).toEqual([]);
  });
});

describe("assignLanes", () => {
  it("puts overlapping items side by side and leaves others full width", () => {
    const placed = assignLanes([
      { id: "a", startMinute: 540, endMinute: 600 },
      { id: "b", startMinute: 570, endMinute: 630 },
      { id: "c", startMinute: 600, endMinute: 660 },
      { id: "d", startMinute: 700, endMinute: 760 },
    ]);
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(byId.a).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId.b).toMatchObject({ lane: 1, lanes: 2 });
    expect(byId.c).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId.d).toMatchObject({ lane: 0, lanes: 1 });
  });
});

describe("visibleRange and blockPosition", () => {
  it("widens working hours to fit availability and bookings, on the hour", () => {
    const days = buildWeek({
      days: week.days,
      timezone: "UTC",
      windows: [{ dayOfWeek: 2, startMinute: 7 * 60 + 30, endMinute: 12 * 60 }],
      bookings: [
        { id: "late", startsAt: new Date("2026-03-06T19:00:00Z"), endsAt: new Date("2026-03-06T20:15:00Z") },
      ],
      timeOff: [{ id: "t", startsAt: new Date("2026-03-07T00:00:00Z"), endsAt: new Date("2026-03-08T00:00:00Z") }],
      now,
    });
    expect(visibleRange(days)).toEqual({ startMinute: 7 * 60, endMinute: 21 * 60 });
  });

  it("clips blocks to the visible range", () => {
    const range = { startMinute: 480, endMinute: 1080 };
    expect(blockPosition({ startMinute: 540, endMinute: 600 }, range)).toEqual({ top: HOUR_PX, height: HOUR_PX });
    expect(blockPosition({ startMinute: 0, endMinute: 1440 }, range)).toEqual({ top: 0, height: 10 * HOUR_PX });
    expect(blockPosition({ startMinute: 0, endMinute: 300 }, range)).toBeNull();
  });
});

describe("time labels", () => {
  it("formats minutes since midnight as clock times", () => {
    expect(formatMinute(0)).toBe("12:00 AM");
    expect(formatMinute(810)).toBe("1:30 PM");
    expect(formatMinute(1440)).toBe("midnight");
    expect(formatHour(420)).toBe("7 AM");
    expect(formatHour(780)).toBe("1 PM");
  });

  it("describes a whole day or part of one", () => {
    expect(describeSpan({ startMinute: 0, endMinute: 1440 })).toBe("All day");
    expect(describeSpan({ startMinute: 780, endMinute: 900 })).toBe("1:00 PM – 3:00 PM");
    expect(describeSpan({ startMinute: 1080, endMinute: 1440 })).toBe("6:00 PM – midnight");
  });
});
