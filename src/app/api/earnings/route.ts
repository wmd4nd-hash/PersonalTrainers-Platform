import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EARNINGS_PERIODS, inRange, ledgerToCsv, periodRange, type EarningsPeriod } from "@/lib/earnings";
import { loadTrainerLedger } from "@/lib/payment-records";

/** The signed-in trainer's earnings statement as CSV. `?period=this-month|last-month|all` (default all). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Log in to download your earnings.", { status: 401 });
  const trainer =
    user.role === "TRAINER"
      ? await db.trainerProfile.findUnique({ where: { userId: user.id }, select: { id: true, timezone: true } })
      : null;
  if (!trainer) return new Response("Only trainers have earnings to download.", { status: 403 });

  const requested = request.nextUrl.searchParams.get("period");
  const period: EarningsPeriod = EARNINGS_PERIODS.find((p) => p === requested) ?? "all";
  const now = new Date();
  const range = periodRange(period, now, trainer.timezone);
  const entries = (await loadTrainerLedger(trainer.id, trainer.timezone, now)).filter((e) => inRange(e.date, range));

  const day = format(new TZDate(now, trainer.timezone), "yyyy-MM-dd");
  return new Response(ledgerToCsv(entries, trainer.timezone), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="earnings-${period}-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
