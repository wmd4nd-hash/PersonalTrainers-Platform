"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { formToObject } from "@/lib/validation";
import { parseWorkoutLog, type FormStateWithValues } from "@/lib/validation/coaching";

/** Records the signed-in client doing one workout from a program assigned to them. */
export async function logWorkout(
  workoutId: string,
  _prev: FormStateWithValues,
  formData: FormData,
): Promise<FormStateWithValues> {
  const client = await requireRole("CLIENT");
  const workout = await db.workout.findFirst({
    where: { id: workoutId, program: { assignments: { some: { clientId: client.id } } } },
    select: {
      id: true,
      dayNumber: true,
      title: true,
      exercises: { select: { id: true } },
      program: { select: { id: true, trainer: { select: { userId: true } } } },
    },
  });
  if (!workout) return { error: "This workout isn't part of your programs any more." };

  // Exercise ids come from the workout itself, never from the form.
  const values = formToObject(formData);
  const parsed = parseWorkoutLog(
    values,
    workout.exercises.map((e) => e.id),
  );
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors, values };
  const { effort, notes, entries } = parsed.data;

  const log = await db.workoutLog.create({
    data: {
      clientId: client.id,
      workoutId: workout.id,
      effort,
      notes,
      entries: { create: entries },
    },
    select: { id: true },
  });

  await notify({
    userId: workout.program.trainer.userId,
    type: "workout.logged",
    title: `${client.name} logged a workout`,
    body: `Day ${workout.dayNumber}: ${workout.title}`,
    link: `/dashboard/clients/${client.id}`,
  });

  redirect(`/dashboard/progress?logged=${log.id}`);
}

export async function deleteWorkoutLog(logId: string) {
  const client = await requireRole("CLIENT");
  await db.workoutLog.deleteMany({ where: { id: logId, clientId: client.id } });
  refresh();
}
