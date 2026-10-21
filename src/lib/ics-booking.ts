/**
 * A single booking as an iCalendar (.ics) file, for "Add to calendar".
 * RFC 5545: CRLF line endings, escaped text, lines folded at 75 octets.
 */

export type IcsBookingInput = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  title: string;
  description?: string;
  location?: string;
  /** Link back to the booking page. */
  url?: string;
  /** Host used in the event UID, e.g. "example.com". */
  domain: string;
  /** When the file is generated. Also used as SEQUENCE so re-downloads replace older copies. */
  now: Date;
  /** Minutes before the start to remind; 0 for no reminder. */
  reminderMinutes?: number;
};

/** 2026-10-22T09:00:00.000Z -> 20261022T090000Z */
export function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds a content line so no physical line exceeds 75 octets (continuations start with a space). */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // The first line holds 75 octets; continuation lines hold 74 plus the leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const statusMap: Record<IcsBookingInput["status"], string> = {
  PENDING_PAYMENT: "TENTATIVE",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "CONFIRMED",
  CANCELLED: "CANCELLED",
};

export function bookingIcs(input: IcsBookingInput): string {
  const reminder = input.reminderMinutes ?? 30;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Personal Trainers Platform//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:booking-${input.id}@${input.domain}`,
    `DTSTAMP:${icsDate(input.now)}`,
    `SEQUENCE:${Math.floor(input.now.getTime() / 1000)}`,
    `DTSTART:${icsDate(input.startsAt)}`,
    `DTEND:${icsDate(input.endsAt)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${escapeIcsText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    `STATUS:${statusMap[input.status]}`,
    ...(reminder > 0 && input.status !== "CANCELLED"
      ? [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${escapeIcsText(input.title)}`,
          `TRIGGER:-PT${reminder}M`,
          "END:VALARM",
        ]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
