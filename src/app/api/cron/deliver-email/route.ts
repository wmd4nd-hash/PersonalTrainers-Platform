import type { NextRequest } from "next/server";
import { deliverQueuedEmails, emailMode } from "@/lib/email/transport";
import { batchLimit } from "../cron";
import { rejectUnauthorizedCron } from "../jobs";

/**
 * Every few minutes: sends whatever is still QUEUED in the outbox. Emails are
 * normally delivered right after the request that queued them; this catches
 * anything left behind (restarts, SMTP outages after an admin resend).
 */
async function handle(request: NextRequest) {
  const denied = rejectUnauthorizedCron(request);
  if (denied) return denied;
  const limit = batchLimit(request.nextUrl.searchParams.get("limit"), 50, 500);
  return Response.json({ ok: true, mode: emailMode(), ...(await deliverQueuedEmails(limit)) });
}

export { handle as GET, handle as POST };
