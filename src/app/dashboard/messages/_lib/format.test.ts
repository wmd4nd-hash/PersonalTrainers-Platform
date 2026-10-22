import { describe, expect, it } from "vitest";
import { dayKey, dayLabel, daysAgo, groupByDay, inboxTimeLabel, previewText, timeLabel } from "./format";

// Thursday 22 October 2026, 10:00 in London (09:00 UTC).
const now = new Date("2026-10-22T09:00:00Z");
const london = "Europe/London";

describe("dayKey and daysAgo", () => {
  it("uses the calendar day in the given timezone", () => {
    const lateEvening = new Date("2026-10-21T23:30:00Z");
    expect(dayKey(lateEvening, "UTC")).toBe("2026-10-21");
    expect(dayKey(lateEvening, "Asia/Tokyo")).toBe("2026-10-22");
  });

  it("counts calendar days, not 24-hour periods", () => {
    expect(daysAgo(new Date("2026-10-21T22:59:00Z"), now, london)).toBe(1);
    expect(daysAgo(new Date("2026-10-21T23:01:00Z"), now, london)).toBe(0);
  });

  it("stays whole across a daylight saving change", () => {
    // UK clocks go back on 25 October 2026.
    const later = new Date("2026-10-27T12:00:00Z");
    expect(daysAgo(new Date("2026-10-24T12:00:00Z"), later, london)).toBe(3);
  });
});

describe("dayLabel", () => {
  it.each([
    ["2026-10-22T07:00:00Z", "Today"],
    ["2026-10-21T12:00:00Z", "Yesterday"],
    ["2026-10-19T12:00:00Z", "Monday"],
    ["2026-10-16T12:00:00Z", "Friday"],
    ["2026-10-15T12:00:00Z", "Thu, Oct 15"],
    ["2025-12-31T12:00:00Z", "Dec 31, 2025"],
  ])("labels %s as %j", (iso, label) => {
    expect(dayLabel(new Date(iso), now, london)).toBe(label);
  });
});

describe("inboxTimeLabel", () => {
  it.each([
    ["2026-10-22T08:05:00Z", "9:05 AM"],
    ["2026-10-21T12:00:00Z", "Yesterday"],
    ["2026-10-19T12:00:00Z", "Mon"],
    ["2026-10-01T12:00:00Z", "Oct 1"],
    ["2025-10-01T12:00:00Z", "Oct 1, 2025"],
  ])("labels %s as %j", (iso, label) => {
    expect(inboxTimeLabel(new Date(iso), now, london)).toBe(label);
  });

  it("shows the time for a message stamped slightly in the future", () => {
    expect(inboxTimeLabel(new Date("2026-10-22T09:00:05Z"), now, london)).toBe("10:00 AM");
  });
});

describe("timeLabel", () => {
  it("formats in the given timezone", () => {
    expect(timeLabel(now, london)).toBe("10:00 AM");
    expect(timeLabel(now, "America/New_York")).toBe("5:00 AM");
  });
});

describe("groupByDay", () => {
  it("starts a new group on each calendar day", () => {
    const items = [
      { id: "a", createdAt: "2026-10-20T08:00:00Z" },
      { id: "b", createdAt: "2026-10-20T20:00:00Z" },
      { id: "c", createdAt: "2026-10-21T23:30:00Z" },
      { id: "d", createdAt: "2026-10-22T08:00:00Z" },
    ];
    const groups = groupByDay(items, london);
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ["2026-10-20", ["a", "b"]],
      ["2026-10-22", ["c", "d"]],
    ]);
  });

  it("returns nothing for no items", () => {
    expect(groupByDay([], london)).toEqual([]);
  });
});

describe("previewText", () => {
  it("collapses whitespace onto one line", () => {
    expect(previewText("Hi Maya,\n\nSee you   at 7")).toBe("Hi Maya, See you at 7");
  });

  it("truncates long messages with an ellipsis", () => {
    const preview = previewText("word ".repeat(50), 20);
    expect(preview.length).toBeLessThanOrEqual(20);
    expect(preview.endsWith("…")).toBe(true);
  });
});
