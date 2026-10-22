import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { expirePurchases } from "@/lib/packages";
import { expireLapsedVerifications } from "@/lib/verification";
import { rejectUnauthorizedCron } from "../jobs";

/** Daily: expires lapsed session packages and verified badges whose documents ran out. */
async function handle(request: NextRequest) {
  const denied = rejectUnauthorizedCron(request);
  if (denied) return denied;
  const now = new Date();
  const expiredPackages = await expirePurchases(now);
  const expiredVerifications = await expireLapsedVerifications(db, now);
  return Response.json({ ok: true, expiredPackages, expiredVerifications });
}

export { handle as GET, handle as POST };
