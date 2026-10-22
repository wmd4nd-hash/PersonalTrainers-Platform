"use server";

import { refresh } from "next/cache";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import { describeTimeOff, timeOffRange } from "@/lib/scheduling";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";
import { MAX_TIME_OFF_DAYS, timeOffSchema } from "@/lib/validation/scheduling";

export type TimeOffState = FormState & {
  /** Bumped on every submission so the form remounts with fresh fields. */
  version?: number;
  /** What was entered, to refill the form after an error. */
  values?: Record<string, string>;
  message?: string;
  /** Set when the new time off covers sessions that are already booked. */
  warning?: string;
};

/** Adds a block of time off, entered in the trainer's own timezone. */
export async function addTimeOff(prev: TimeOffState, formData: FormData): Promise<TimeOffState> {
  const trainerId = await requireTrainerProfileId();
  const version = (prev.version ?? 0) + 1;
  const values = formToObject(formData);
  const parsed = timeOffSchema.safeParse(values);
  if (!parsed.success) return { ...fieldErrorsOf(parsed.error), version, values };

  const { timezone } = await db.trainerProfile.findUniqueOrThrow({
    where: { id: trainerId },
    select: { timezone: true },
  });
  const { startsAt, endsAt } = timeOffRange(parsed.data, timezone);
  if (endsAt <= new Date()) {
    return { fieldErrors: { endDate: ["That time is already over"] }, version, values };
  }
  if (endsAt.getTime() - startsAt.getTime() > MAX_TIME_OFF_DAYS * 86_400_000) {
    return { fieldErrors: { endDate: ["Add time off one year at a time at most"] }, version, values };
  }

  await db.timeOff.create({ data: { trainerId, startsAt, endsAt, reason: parsed.data.reason } });
  const clashes = await db.booking.count({
    where: { trainerId, status: "CONFIRMED", startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
  });

  refresh();
  return {
    ok: true,
    version,
    message: `Time off added: ${describeTimeOff(startsAt, endsAt, timezone)}. Clients can't book that time.`,
    warning:
      clashes > 0
        ? `You already have ${clashes} session${clashes === 1 ? "" : "s"} booked in that time. ` +
          `Clients aren't told automatically, so open ${clashes === 1 ? "it" : "each one"} from your calendar to move or cancel it.`
        : undefined,
  };
}

export async function deleteTimeOff(timeOffId: string) {
  const trainerId = await requireTrainerProfileId();
  await db.timeOff.deleteMany({ where: { id: timeOffId, trainerId } });
  refresh();
}
