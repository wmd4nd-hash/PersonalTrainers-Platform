import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine, formatDuration, formatUtc } from "./ics";

const encoder = new TextEncoder();
const octets = (s: string) => encoder.encode(s).length;
/** Reverses folding (RFC 5545 §3.1). */
const unfold = (s: string) => s.replace(/\r\n /g, "");

describe("escapeText", () => {
  it("escapes backslashes, semicolons, commas and line breaks", () => {
    expect(escapeText("Gym; Floor 2, Room A")).toBe("Gym\\; Floor 2\\, Room A");
    expect(escapeText("C:\\path")).toBe("C:\\\\path");
    expect(escapeText("one\ntwo\r\nthree\rfour")).toBe("one\\ntwo\\nthree\\nfour");
  });

  it("escapes the backslash before the characters it introduces", () => {
    expect(escapeText("\\,")).toBe("\\\\\\,");
  });

  it("drops control characters", () => {
    expect(escapeText("a\u0000b\u0007c")).toBe("abc");
  });
});

describe("formatUtc", () => {
  it("writes basic-format UTC date-times", () => {
    expect(formatUtc(new Date("2026-03-10T10:05:09.123Z"))).toBe("20260310T100509Z");
  });

  it("converts offsets to UTC", () => {
    expect(formatUtc(new Date("2026-07-01T09:00:00+02:00"))).toBe("20260701T070000Z");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Short")).toBe("SUMMARY:Short");
    const exactly75 = `DESCRIPTION:${"x".repeat(63)}`;
    expect(octets(exactly75)).toBe(75);
    expect(foldLine(exactly75)).toBe(exactly75);
  });

  it("folds long lines at 75 octets with a leading space on continuations", () => {
    const line = `DESCRIPTION:${"a".repeat(200)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBe(3);
    expect(octets(parts[0]!)).toBe(75);
    for (const part of parts.slice(1)) {
      expect(part.startsWith(" ")).toBe(true);
      expect(octets(part)).toBeLessThanOrEqual(75);
    }
    expect(unfold(folded)).toBe(line);
  });

  it("never splits a multi-byte character", () => {
    const line = `LOCATION:${"é".repeat(60)}${"🏋️".repeat(10)}`;
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) {
      expect(octets(part)).toBeLessThanOrEqual(75);
      // A split UTF-8 sequence would decode to the replacement character.
      expect(new TextDecoder().decode(encoder.encode(part))).not.toContain("\uFFFD");
    }
    expect(unfold(folded)).toBe(line);
  });
});

describe("formatDuration", () => {
  it("uses hours when it can", () => {
    expect(formatDuration(60)).toBe("PT1H");
    expect(formatDuration(120)).toBe("PT2H");
    expect(formatDuration(90)).toBe("PT90M");
  });
});

describe("buildCalendar", () => {
  const now = new Date("2026-03-01T12:00:00Z");
  const ics = buildCalendar({
    prodId: "-//PT Platform//Sessions//EN",
    name: "PT Platform sessions",
    refreshMinutes: 60,
    now,
    events: [
      {
        uid: "booking-abc@example.com",
        start: new Date("2026-03-10T10:00:00Z"),
        end: new Date("2026-03-10T11:00:00Z"),
        summary: "Training with Maya Okafor",
        description: "In-person session.\nBring water, a towel; and trainers.",
        location: "PureGym Camden, London",
        url: "https://example.com/dashboard/bookings/abc?x=1,2",
      },
    ],
  });
  const lines = unfold(ics).split("\r\n");

  it("uses CRLF line endings and ends with one", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("wraps events in a calendar", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//PT Platform//Sessions//EN");
    expect(lines).toContain("X-WR-CALNAME:PT Platform sessions");
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
  });

  it("writes event times in UTC and escapes text", () => {
    expect(lines).toContain("UID:booking-abc@example.com");
    expect(lines).toContain("DTSTAMP:20260301T120000Z");
    expect(lines).toContain("DTSTART:20260310T100000Z");
    expect(lines).toContain("DTEND:20260310T110000Z");
    expect(lines).toContain("SUMMARY:Training with Maya Okafor");
    expect(lines).toContain("DESCRIPTION:In-person session.\\nBring water\\, a towel\\; and trainers.");
    expect(lines).toContain("LOCATION:PureGym Camden\\, London");
    expect(lines).toContain("STATUS:CONFIRMED");
  });

  it("does not escape URIs", () => {
    expect(lines).toContain("URL:https://example.com/dashboard/bookings/abc?x=1,2");
  });

  it("keeps every physical line within 75 octets", () => {
    const long = buildCalendar({
      prodId: "-//Test//EN",
      now,
      events: [
        {
          uid: "x@y",
          start: now,
          end: now,
          summary: "S".repeat(300),
          description: "Ünïcödé ".repeat(40),
        },
      ],
    });
    for (const line of long.split("\r\n")) expect(octets(line)).toBeLessThanOrEqual(75);
  });

  it("writes an empty but valid calendar", () => {
    const empty = buildCalendar({ prodId: "-//Test//EN", now, events: [] });
    expect(empty).toBe(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR\r\n",
    );
  });
});
