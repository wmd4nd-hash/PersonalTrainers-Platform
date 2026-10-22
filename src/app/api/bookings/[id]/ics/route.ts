import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookingIcs } from "@/lib/ics-booking";
import { dateKey } from "@/lib/scheduling";
import { appUrl } from "@/lib/stripe";

/** "Add to calendar": the booking as an .ics file, for its client or trainer only. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/ics">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Please log in to download this session.", { status: 401 });

  const booking = await db.booking.findFirst({
    where: { id, OR: [{ clientId: user.id }, { trainer: { userId: user.id } }] },
    include: {
      client: { select: { name: true } },
      trainer: { select: { timezone: true, userId: true, user: { select: { name: true } } } },
    },
  });
  // Same answer for "doesn't exist" and "not yours", so ids can't be probed.
  if (!booking) return new Response("Not found", { status: 404 });

  const isTrainer = booking.trainer.userId === user.id;
  const otherName = isTrainer ? booking.client.name : booking.trainer.user.name;
  const link = appUrl(`/dashboard/bookings/${booking.id}`);
  const online = booking.format === "ONLINE";
  // Like the booking page, only share the video link once the session is paid for.
  const meetingUrl = booking.status === "CONFIRMED" || booking.status === "COMPLETED" ? booking.meetingUrl : null;

  const description = [
    online
      ? meetingUrl
        ? `Online session. Join the video call: ${meetingUrl}`
        : "Online session. The video link appears on the booking page once payment is confirmed."
      : `In-person session${booking.location ? ` at ${booking.location}` : ""}.`,
    booking.notes && `Notes: ${booking.notes}`,
    `Booking details: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

  const ics = bookingIcs({
    id: booking.id,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    title: `Training session with ${otherName}`,
    description,
    location: online ? (meetingUrl ?? "") : booking.location,
    url: link,
    domain: new URL(appUrl()).hostname,
    now: new Date(),
  });

  const filename = `session-${dateKey(booking.startsAt, booking.trainer.timezone)}.ics`;
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
