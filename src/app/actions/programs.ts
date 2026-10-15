"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  exerciseSchema,
  fieldErrorsOf,
  formToObject,
  programSchema,
  workoutSchema,
  type FormState,
} from "@/lib/validation";

/** Throws a redirect unless the program belongs to the signed-in trainer. */
async function ownProgram(programId: string) {
  const trainerId = await requireTrainerProfileId();
  const program = await db.program.findFirst({
    where: { id: programId, trainerId },
    select: { id: true, trainerId: true },
  });
  if (!program) redirect("/dashboard/programs");
  return program;
}

export async function createProgram(_prev: FormState, formData: FormData): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();
  const parsed = programSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  const program = await db.program.create({
    data: { ...parsed.data, trainerId },
    select: { id: true },
  });
  redirect(`/dashboard/programs/${program.id}`);
}

export async function addWorkout(
  programId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await ownProgram(programId);
  const parsed = workoutSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  await db.workout.create({ data: { ...parsed.data, programId } });
  refresh();
  return { ok: true };
}

export async function deleteWorkout(programId: string, workoutId: string) {
  await ownProgram(programId);
  await db.workout.deleteMany({ where: { id: workoutId, programId } });
  refresh();
}

export async function addExercise(
  programId: string,
  workoutId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await ownProgram(programId);
  const parsed = exerciseSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  const workout = await db.workout.findFirst({
    where: { id: workoutId, programId },
    select: { id: true, _count: { select: { exercises: true } } },
  });
  if (!workout) return { error: "Workout not found" };

  await db.exercise.create({
    data: { ...parsed.data, workoutId, position: workout._count.exercises },
  });
  refresh();
  return { ok: true };
}

export async function deleteExercise(programId: string, exerciseId: string) {
  await ownProgram(programId);
  await db.exercise.deleteMany({ where: { id: exerciseId, workout: { programId } } });
  refresh();
}

export async function assignProgram(
  programId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const program = await ownProgram(programId);
  const clientId = String(formData.get("clientId") ?? "");

  // Trainers can only assign programs to clients who have booked with them.
  const client = await db.user.findFirst({
    where: {
      id: clientId,
      role: "CLIENT",
      bookings: { some: { trainerId: program.trainerId } },
    },
    select: { id: true },
  });
  if (!client) return { error: "Choose one of your clients" };

  await db.programAssignment.upsert({
    where: { programId_clientId: { programId, clientId: client.id } },
    create: { programId, clientId: client.id },
    update: {},
  });
  refresh();
  return { ok: true };
}

export async function unassignProgram(programId: string, clientId: string) {
  await ownProgram(programId);
  await db.programAssignment.deleteMany({ where: { programId, clientId } });
  refresh();
}
