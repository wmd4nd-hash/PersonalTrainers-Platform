import type { NextRequest } from "next/server";
import { completeFinishedSessions, rejectUnauthorizedCron } from "../jobs";

/** Hourly: marks confirmed sessions that ended over 12 hours ago as completed. */
async function handle(request: NextRequest) {
  const denied = rejectUnauthorizedCron(request);
  if (denied) return denied;
  return Response.json({ ok: true, ...(await completeFinishedSessions(new Date())) });
}

export { handle as GET, handle as POST };
