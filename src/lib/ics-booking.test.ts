import { describe, expect, it } from "vitest";
import { bookingIcs, escapeIcsText, foldIcsLine, icsDate } from "./ics-booking";

const base = {
  id: "bk1",
  startsAt: new Date("2026-10-22T09:00:00Z"),
  endsAt: new Date("2026-10-22T10:00:00Z"),
  status: "CONFIRMED" as const,
  title: "Training session with Maya Okafor",
  domain: "example.com",
  now: new Date("2026-10-21T12:00:00Z"),
};

describe("icsDate", () => {
  it("formats instants in UTC basic format", () => {
    expect(icsDate(new Date("2026-10-22T09:05:07.123Z"))).toBe("20261022T090507Z");
  });
});

describe("escapeIcsText", () => {
  it("escapes special characters and newlines", () => {
    expect(escapeIcsText("Gym, room 2; bring shoes\\towel\nSee you")).toBe(
      "Gym\\, room 2\\; bring shoes\\\\towel\\nSee you",
    );
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines alone", () => {
    expect(foldIcsLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = `DESCRIPTION:${"é".repeat(100)}`;
    const folded = foldIcsLine(line);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const part of physical) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(physical.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(physical.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(line);
  });
});

describe("bookingIcs", () => {
  it("builds a valid single-event calendar", () => {
    const ics = bookingIcs({
      ...base,
      description: "Join: https://meet.jit.si/ptp-bk1",
      location: "https://meet.jit.si/ptp-bk1",
      url: "https://example.com/dashboard/bookings/bk1",
    });
    expect(ics.endsWith("\r\n")).toBe(true);
    const lines = ics.trimEnd().split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("UID:booking-bk1@example.com");
    expect(lines).toContain("DTSTART:20261022T090000Z");
    expect(lines).toContain("DTEND:20261022T100000Z");
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(lines).toContain("TRIGGER:-PT30M");
    expect(lines).toContain("LOCATION:https://meet.jit.si/ptp-bk1");
  });

  it("marks cancelled sessions and drops the reminder", () => {
    const ics = bookingIcs({ ...base, status: "CANCELLED" });
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).not.toContain("VALARM");
  });

  it("uses a later sequence for a later download, so calendars take the update", () => {
    const first = bookingIcs(base);
    const second = bookingIcs({ ...base, now: new Date("2026-10-21T13:00:00Z") });
    const seq = (ics: string) => Number(/SEQUENCE:(\d+)/.exec(ics)![1]);
    expect(seq(second)).toBeGreaterThan(seq(first));
  });
});
