import type { NextRequest } from "next/server";
import { batchLimit } from "../cron";
import { rejectUnauthorizedCron, sendDueReminders } from "../jobs";

/** Hourly: emails the day-before reminder for confirmed sessions. */
async function handle(request: NextRequest) {
  const denied = rejectUnauthorizedCron(request);
  if (denied) return denied;
  const limit = batchLimit(request.nextUrl.searchParams.get("limit"), 200, 1000);
  return Response.json({ ok: true, ...(await sendDueReminders(new Date(), limit)) });
}

export { handle as GET, handle as POST };
