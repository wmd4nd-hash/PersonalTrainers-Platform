/**
 * Minimal iCalendar (RFC 5545) writer for calendar feeds. Pure: no I/O, no clock.
 *
 * Times are always written in UTC ("20260310T100000Z") so calendar apps show them
 * in the viewer's own timezone without needing VTIMEZONE blocks.
 */

const CRLF = "\r\n";
/** RFC 5545 §3.1: lines are at most 75 octets, excluding the line break. */
const MAX_LINE_OCTETS = 75;

export type IcsEventStatus = "CONFIRMED" | "TENTATIVE" | "CANCELLED";

export type IcsEvent = {
  /** Globally unique and stable across feed refreshes, e.g. "booking-abc@example.com". */
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  /** Absolute link back to the app. */
  url?: string;
  status?: IcsEventStatus;
};

export type IcsCalendar = {
  /** Product identifier, e.g. "-//PT Platform//Sessions//EN". */
  prodId: string;
  /** Name calendar apps show for a subscribed feed. */
  name?: string;
  description?: string;
  /** How often subscribers should refresh the feed. */
  refreshMinutes?: number;
  events: IcsEvent[];
  /** Used for DTSTAMP. */
  now: Date;
};

const encoder = new TextEncoder();

function octets(value: string): number {
  return encoder.encode(value).length;
}

// Control characters other than tab and line breaks are not allowed in content lines.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Escapes a TEXT value (SUMMARY, DESCRIPTION, LOCATION…). */
export function escapeText(value: string): string {
  return value
    .replace(CONTROL_CHARS, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Values that are not TEXT (UIDs, URIs) only need line breaks and control characters removed. */
function sanitizeValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(CONTROL_CHARS, "");
}

/** 2026-03-10T10:00:00.000Z -> "20260310T100000Z" */
export function formatUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

/**
 * Folds a content line so no physical line exceeds 75 octets. Continuation lines
 * start with a single space. Never splits a multi-byte UTF-8 character.
 */
export function foldLine(line: string): string {
  if (octets(line) <= MAX_LINE_OCTETS) return line;
  const lines: string[] = [];
  let current = "";
  let size = 0;
  // The leading space of a continuation line counts towards its 75 octets.
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const charSize = octets(char);
    if (size + charSize > limit) {
      lines.push(current);
      current = "";
      size = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += char;
    size += charSize;
  }
  lines.push(current);
  return lines.join(`${CRLF} `);
}

/** Minutes -> an iCalendar duration, e.g. 60 -> "PT1H", 90 -> "PT90M". */
export function formatDuration(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  return whole % 60 === 0 ? `PT${whole / 60}H` : `PT${whole}M`;
}

function eventLines(event: IcsEvent, now: Date): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${sanitizeValue(event.uid)}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(event.start)}`,
    `DTEND:${formatUtc(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${sanitizeValue(event.url)}`);
  lines.push(`STATUS:${event.status ?? "CONFIRMED"}`, "END:VEVENT");
  return lines;
}

/** Builds a complete VCALENDAR document with CRLF line endings. */
export function buildCalendar(calendar: IcsCalendar): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${sanitizeValue(calendar.prodId)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (calendar.name) lines.push(`X-WR-CALNAME:${escapeText(calendar.name)}`);
  if (calendar.description) lines.push(`X-WR-CALDESC:${escapeText(calendar.description)}`);
  if (calendar.refreshMinutes) {
    const duration = formatDuration(calendar.refreshMinutes);
    lines.push(`REFRESH-INTERVAL;VALUE=DURATION:${duration}`, `X-PUBLISHED-TTL:${duration}`);
  }
  for (const event of calendar.events) lines.push(...eventLines(event, calendar.now));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
