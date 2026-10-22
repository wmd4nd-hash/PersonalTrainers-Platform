import type { NextRequest } from "next/server";
import { parseCalendarToken } from "@/lib/account";
import { db } from "@/lib/db";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { site } from "@/lib/site";
import { appUrl } from "@/lib/stripe";

const DAY = 86_400_000;
/** Recent sessions stay in the feed for this long, so last week's still shows. */
const PAST_DAYS = 60;
const FUTURE_DAYS = 366;

/**
 * Private calendar feed (subscribe by URL from Google, Apple or Outlook). The
 * secret token in the path is the only credential, as calendar apps can't log
 * in; users can rotate it from Settings.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/calendar/[token]">) {
  const token = parseCalendarToken((await ctx.params).token);
  const user = token
    ? await db.user.findFirst({
        where: { calendarToken: token, suspendedAt: null },
        select: { id: true, role: true, trainerProfile: { select: { id: true } } },
      })
    : null;
  // Same answer for malformed and unknown tokens.
  if (!user) return new Response("Calendar not found", { status: 404 });

  const now = new Date();
  const asTrainer = user.role === "TRAINER" && user.trainerProfile;
  const bookings =
    user.role === "ADMIN"
      ? []
      : await db.booking.findMany({
          where: {
            ...(asTrainer ? { trainerId: user.trainerProfile!.id } : { clientId: user.id }),
            status: { in: ["CONFIRMED", "COMPLETED"] },
            startsAt: { gte: new Date(now.getTime() - PAST_DAYS * DAY), lte: new Date(now.getTime() + FUTURE_DAYS * DAY) },
          },
          include: {
            client: { select: { name: true } },
            trainer: { select: { user: { select: { name: true } } } },
          },
          orderBy: { startsAt: "asc" },
          take: 1000,
        });

  const host = new URL(appUrl("/")).hostname;
  const events: IcsEvent[] = bookings.map((b) => {
    const online = b.format === "ONLINE";
    const url = appUrl(`/dashboard/bookings/${b.id}`);
    const description = [
      asTrainer ? `Client: ${b.client.name}` : `Trainer: ${b.trainer.user.name}`,
      online
        ? b.meetingUrl
          ? `Online session. Join the video call: ${b.meetingUrl}`
          : "Online session. The video link is on the booking page."
        : `In-person session${b.location ? ` at ${b.location}` : ""}.`,
      b.notes && `Notes: ${b.notes}`,
      `Booking details: ${url}`,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      uid: `booking-${b.id}@${host}`,
      start: b.startsAt,
      end: b.endsAt,
      summary: asTrainer ? `Session with ${b.client.name}` : `Training with ${b.trainer.user.name}`,
      description,
      location: online ? (b.meetingUrl ?? "Online") : b.location,
      url,
      status: "CONFIRMED",
    };
  });

  const ics = buildCalendar({
    prodId: `-//${site.shortName}//Sessions//EN`,
    name: `${site.shortName} sessions`,
    description: asTrainer ? "Your training sessions with clients" : "Your training sessions",
    refreshMinutes: 60,
    events,
    now,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="sessions.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
