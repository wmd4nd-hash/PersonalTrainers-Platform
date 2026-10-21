"use server";

import { refresh } from "next/cache";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  availabilityWindowSchema,
  fieldErrorsOf,
  formToObject,
  trainerProfileSchema,
  type FormState,
} from "@/lib/validation";

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

export async function addAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();
  const parsed = availabilityWindowSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { dayOfWeek, start, end } = parsed.data;

  await db.availabilityWindow.create({
    data: { trainerId, dayOfWeek, startMinute: start, endMinute: end },
  });
  refresh();
  return { ok: true };
}

export async function deleteAvailability(windowId: string) {
  const trainerId = await requireTrainerProfileId();
  await db.availabilityWindow.deleteMany({ where: { id: windowId, trainerId } });
  refresh();
}
