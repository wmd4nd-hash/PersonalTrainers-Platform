"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireTrainerProfileId } from "@/lib/auth";
import { assignProgramToClient } from "@/lib/clients";
import { db } from "@/lib/db";
import {
  exerciseSchema,
  fieldErrorsOf,
  formToObject,
  programSchema,
  workoutSchema,
  type FormState,
} from "@/lib/validation";
import { assignProgramSchema } from "@/lib/validation/coaching";

const TITLE_MAX = 120;

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

function copyTitle(title: string) {
  const suffix = " (copy)";
  return `${title.slice(0, TITLE_MAX - suffix.length).trimEnd()}${suffix}`;
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

export async function updateProgram(
  programId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const program = await ownProgram(programId);
  const parsed = programSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  await db.program.updateMany({ where: { id: program.id, trainerId: program.trainerId }, data: parsed.data });
  refresh();
  return { ok: true };
}

/** Copies a program with all its workouts and exercises. Assignments and logs stay with the original. */
export async function duplicateProgram(programId: string) {
  const trainerId = await requireTrainerProfileId();
  const source = await db.program.findFirst({
    where: { id: programId, trainerId },
    include: {
      workouts: {
        orderBy: [{ dayNumber: "asc" }, { id: "asc" }],
        include: { exercises: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
      },
    },
  });
  if (!source) redirect("/dashboard/programs");

  // One nested create, so the copy is all-or-nothing.
  const copy = await db.program.create({
    data: {
      trainerId,
      title: copyTitle(source.title),
      description: source.description,
      workouts: {
        create: source.workouts.map((w) => ({
          dayNumber: w.dayNumber,
          title: w.title,
          notes: w.notes,
          exercises: {
            create: w.exercises.map((e, position) => ({
              position,
              name: e.name,
              sets: e.sets,
              reps: e.reps,
              restSeconds: e.restSeconds,
            })),
          },
        })),
      },
    },
    select: { id: true },
  });
  redirect(`/dashboard/programs/${copy.id}?copied=1`);
}

/** Deletes a program with its workouts, assignments and the workout logs recorded against it. */
export async function deleteProgram(programId: string) {
  const program = await ownProgram(programId);
  await db.program.deleteMany({ where: { id: program.id, trainerId: program.trainerId } });
  redirect("/dashboard/programs?deleted=1");
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

  const workout = await db.workout.findFirst({ where: { id: workoutId, programId }, select: { id: true } });
  if (!workout) return { error: "Workout not found" };

  // After the current last one; a count could collide with positions left by deletes.
  const last = await db.exercise.aggregate({ where: { workoutId: workout.id }, _max: { position: true } });
  await db.exercise.create({
    data: { ...parsed.data, workoutId: workout.id, position: (last._max.position ?? -1) + 1 },
  });
  refresh();
  return { ok: true };
}

export async function updateExercise(
  programId: string,
  exerciseId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await ownProgram(programId);
  const parsed = exerciseSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  const { count } = await db.exercise.updateMany({
    where: { id: exerciseId, workout: { programId } },
    data: parsed.data,
  });
  if (count === 0) return { error: "This exercise was removed. Refresh the page." };
  refresh();
  return { ok: true };
}

export async function moveExercise(programId: string, exerciseId: string, direction: "up" | "down") {
  await ownProgram(programId);
  if (direction !== "up" && direction !== "down") return;

  await db.$transaction(async (tx) => {
    const exercise = await tx.exercise.findFirst({
      where: { id: exerciseId, workout: { programId } },
      select: { workoutId: true },
    });
    if (!exercise) return;

    const order = await tx.exercise.findMany({
      where: { workoutId: exercise.workoutId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const from = order.findIndex((e) => e.id === exerciseId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];

    // Rewrite every position as 0..n-1: clears gaps and ties, and a concurrent
    // move ends as one consistent order rather than a mix of both.
    for (const [position, { id }] of order.entries()) {
      await tx.exercise.update({ where: { id }, data: { position } });
    }
  });
  refresh();
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
  const parsed = assignProgramSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  // Only to clients who have booked or bought a package with this trainer.
  const result = await assignProgramToClient({
    trainerId: program.trainerId,
    programId: program.id,
    clientId: parsed.data.clientId,
    startsOn: parsed.data.startsOn,
  });
  if ("error" in result) return { error: result.error };
  refresh();
  return { ok: true };
}

export async function unassignProgram(programId: string, clientId: string) {
  await ownProgram(programId);
  await db.programAssignment.deleteMany({ where: { programId, clientId } });
  refresh();
}
