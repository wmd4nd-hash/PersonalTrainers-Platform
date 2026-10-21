"use server";

import { refresh } from "next/cache";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  copyWindowsToDays,
  DAY_NAMES,
  findOverlappingWindow,
  formatTimeOfDay,
  WEEKDAYS,
} from "@/lib/scheduling";
import {
  availabilityWindowSchema,
  fieldErrorsOf,
  formToObject,
  trainerProfileSchema,
  type FormState,
} from "@/lib/validation";
import { copyDaySchema } from "@/lib/validation/scheduling";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();
  const parsed = trainerProfileSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { sessionRate, gender, ...rest } = parsed.data;

  await db.trainerProfile.update({
    where: { id: trainerId },
    data: { ...rest, sessionRateCents: sessionRate, user: { update: { gender } } },
  });
  refresh();
  return { ok: true };
}

export type AvailabilityFormState = FormState & {
  /** Bumped on every submission so the form remounts with fresh fields. */
  version?: number;
  /** What was entered, to refill the form after an error. */
  values?: Record<string, string>;
  message?: string;
};

export async function addAvailability(
  prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  const trainerId = await requireTrainerProfileId();
  const version = (prev.version ?? 0) + 1;
  const values = formToObject(formData);
  const parsed = availabilityWindowSchema.safeParse(values);
  if (!parsed.success) return { ...fieldErrorsOf(parsed.error), version, values };
  const { dayOfWeek, start, end } = parsed.data;

  const existing = await db.availabilityWindow.findMany({ where: { trainerId, dayOfWeek } });
  const clash = findOverlappingWindow(existing, { dayOfWeek, startMinute: start, endMinute: end });
  if (clash) {
    return {
      fieldErrors: {
        start: [
          `This overlaps your ${DAY_NAMES[dayOfWeek]} hours ${formatTimeOfDay(clash.startMinute)}–${formatTimeOfDay(clash.endMinute)}. ` +
            "Change the times or remove that window first.",
        ],
      },
      version,
      values,
    };
  }

  await db.availabilityWindow.create({
    data: { trainerId, dayOfWeek, startMinute: start, endMinute: end },
  });
  refresh();
  // Keep the chosen day so adding several windows for one day is quick.
  return {
    ok: true,
    version,
    values: { dayOfWeek: String(dayOfWeek) },
    message: `Added ${DAY_NAMES[dayOfWeek]} ${formatTimeOfDay(start)}–${formatTimeOfDay(end)}.`,
  };
}

export async function deleteAvailability(windowId: string) {
  const trainerId = await requireTrainerProfileId();
  await db.availabilityWindow.deleteMany({ where: { id: windowId, trainerId } });
  refresh();
}

/** Replaces the other weekdays' hours (Monday to Friday) with one weekday's hours. */
export async function copyDayToWeekdays(
  _prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  const trainerId = await requireTrainerProfileId();
  const parsed = copyDaySchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { sourceDay } = parsed.data;

  const windows = await db.availabilityWindow.findMany({ where: { trainerId, dayOfWeek: sourceDay } });
  if (windows.length === 0) {
    return { error: `Add some ${DAY_NAMES[sourceDay]} hours first, then copy them.` };
  }
  const targets = WEEKDAYS.filter((day) => day !== sourceDay);
  const copies = copyWindowsToDays(windows, sourceDay, [...targets]);

  await db.$transaction([
    db.availabilityWindow.deleteMany({ where: { trainerId, dayOfWeek: { in: targets } } }),
    db.availabilityWindow.createMany({ data: copies.map((w) => ({ ...w, trainerId })) }),
  ]);
  refresh();
  return { ok: true, message: `Copied ${DAY_NAMES[sourceDay]}'s hours to the other weekdays.` };
}
