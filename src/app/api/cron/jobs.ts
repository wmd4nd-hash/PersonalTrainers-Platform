import "server-only";
import { db } from "@/lib/db";
import { bookingReminder } from "@/lib/events";
import { completionCutoff, isCronAuthorized, reminderWindow } from "./cron";

/** 401 unless the request carries the cron secret (see cron.ts). */
export function rejectUnauthorizedCron(request: Request): Response | null {
  if (isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET, process.env.NODE_ENV)) {
    return null;
  }
  return Response.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="cron"' } },
  );
}

/**
 * Sends the 24-hour reminder for confirmed sessions starting 23 to 25 hours
 * from now. Each booking is claimed by setting reminderSentAt first, so
 * overlapping runs never remind twice.
 */
export async function sendDueReminders(now: Date, limit: number) {
  const { from, to } = reminderWindow(now);
  const due = await db.booking.findMany({
    where: { status: "CONFIRMED", reminderSentAt: null, startsAt: { gte: from, lte: to } },
    select: { id: true },
    orderBy: { startsAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  for (const { id } of due) {
    const { count } = await db.booking.updateMany({
      where: { id, status: "CONFIRMED", reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (count === 0) continue;
    try {
      await bookingReminder(id);
      sent++;
    } catch (err) {
      // The claim stays: a reminder that half-sent shouldn't go out twice.
      console.error(`[cron] reminder for booking ${id} failed`, err);
      failed++;
    }
  }
  return { due: due.length, sent, failed };
}

/** Marks confirmed sessions that ended more than 12 hours ago as completed. */
export async function completeFinishedSessions(now: Date) {
  const { count } = await db.booking.updateMany({
    where: { status: "CONFIRMED", endsAt: { lt: completionCutoff(now) } },
    data: { status: "COMPLETED", completedAt: now },
  });
  return { completed: count };
}
