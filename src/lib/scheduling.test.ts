import { describe, expect, it } from "vitest";
import {
  formatTimeOfDay,
  generateSlots,
  isSlotAvailable,
  parseTimeOfDay,
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
