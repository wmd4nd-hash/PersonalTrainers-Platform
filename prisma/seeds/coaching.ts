import { platformFeeCents } from "../../src/lib/fees";
import type { SeedContext } from "./context";

const DAY_MS = 24 * 60 * 60 * 1000;

const PROGRAM_TITLE = "Beginner strength";

/** Exercises with a starting weight and how much it goes up each time the workout is repeated. */
type SeedExercise = { name: string; sets: number; reps: string; restSeconds: number; startKg: number | null; stepKg: number };

const workouts: { dayNumber: number; title: string; notes: string; exercises: SeedExercise[] }[] = [
  {
    dayNumber: 1,
    title: "Lower body",
    notes: "5 minutes of easy cardio and bodyweight squats to warm up.",
    exercises: [
      { name: "Goblet squat", sets: 3, reps: "8-12", restSeconds: 90, startKg: 16, stepKg: 2 },
      { name: "Romanian deadlift", sets: 3, reps: "8-10", restSeconds: 90, startKg: 30, stepKg: 5 },
      { name: "Walking lunge", sets: 3, reps: "10", restSeconds: 60, startKg: 8, stepKg: 2 },
      { name: "Plank", sets: 3, reps: "30s", restSeconds: 45, startKg: null, stepKg: 0 },
    ],
  },
  {
    dayNumber: 2,
    title: "Upper body",
    notes: "Keep your shoulder blades back and down on every press.",
    exercises: [
      { name: "Dumbbell bench press", sets: 3, reps: "8-12", restSeconds: 90, startKg: 14, stepKg: 2 },
      { name: "One-arm dumbbell row", sets: 3, reps: "10", restSeconds: 60, startKg: 16, stepKg: 2 },
      { name: "Overhead press", sets: 3, reps: "8", restSeconds: 90, startKg: 10, stepKg: 1.25 },
      { name: "Face pull", sets: 2, reps: "15", restSeconds: 45, startKg: 15, stepKg: 2.5 },
    ],
  },
  {
    dayNumber: 3,
    title: "Full body",
    notes: "Finish with 5 minutes of stretching.",
    exercises: [
      { name: "Deadlift", sets: 3, reps: "5", restSeconds: 120, startKg: 50, stepKg: 5 },
      { name: "Push-up", sets: 3, reps: "AMRAP", restSeconds: 60, startKg: null, stepKg: 0 },
      { name: "Kettlebell swing", sets: 3, reps: "15", restSeconds: 60, startKg: 12, stepKg: 4 },
      { name: "Farmer's carry", sets: 3, reps: "40m", restSeconds: 60, startKg: 20, stepKg: 4 },
    ],
  },
];

/** Eight sessions over the last four weeks, rotating through the three workouts. */
const sessions = [
  { daysAgo: 27, effort: 6, notes: "First session. Felt good, form cues helped." },
  { daysAgo: 25, effort: 6, notes: "" },
  { daysAgo: 22, effort: 7, notes: "Deadlifts felt heavy on the last set." },
  { daysAgo: 20, effort: 7, notes: "" },
  { daysAgo: 15, effort: 7, notes: "Slept badly but pushed through." },
  { daysAgo: 13, effort: 8, notes: "" },
  { daysAgo: 8, effort: 8, notes: "New best on goblet squats!" },
  { daysAgo: 4, effort: 7, notes: "" },
];

/** What the client did on their k-th go: a rep more within a range, more push-ups each time. */
function repsDone(target: string, k: number) {
  if (/^8-1[02]$/.test(target)) return String(8 + k);
  if (target === "AMRAP") return String(8 + 2 * k);
  return target;
}

/** Demo data for the coaching feature. Must be safe to run more than once. */
export async function seedCoaching(ctx: SeedContext) {
  const { db } = ctx;
  const maya = ctx.trainers["maya@example.com"];
  const client = ctx.clients["client@example.com"];
  if (!maya || !client) return;
  const now = Date.now();

  // The assignment rule needs a real booking: add a past completed session if there isn't one.
  const completed = await db.booking.findFirst({
    where: { trainerId: maya.trainerId, clientId: client.userId, status: "COMPLETED" },
    select: { id: true },
  });
  if (!completed) {
    const trainer = await db.trainerProfile.findUniqueOrThrow({ where: { id: maya.trainerId } });
    const paidBefore = await db.booking.count({
      where: { trainerId: maya.trainerId, clientId: client.userId, status: { in: ["CONFIRMED", "COMPLETED"] } },
    });
    const startsAt = new Date(now - 29 * DAY_MS);
    startsAt.setUTCHours(8, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + trainer.sessionMinutes * 60_000);
    await db.booking.create({
      data: {
        trainerId: maya.trainerId,
        clientId: client.userId,
        startsAt,
        endsAt,
        status: "COMPLETED",
        format: "IN_PERSON",
        location: trainer.defaultLocation,
        priceCents: trainer.sessionRateCents,
        currency: trainer.currency,
        platformFeeCents: platformFeeCents(trainer.sessionRateCents, { isNewClient: paidBefore === 0 }),
        notes: "Intro session: movement screen and goals.",
        completedAt: endsAt,
        createdAt: new Date(startsAt.getTime() - 3 * DAY_MS),
      },
    });
  }

  let program = await db.program.findFirst({
    where: { trainerId: maya.trainerId, title: PROGRAM_TITLE },
    include: { workouts: { include: { exercises: true } } },
  });
  if (!program) {
    program = await db.program.create({
      data: {
        trainerId: maya.trainerId,
        title: PROGRAM_TITLE,
        description:
          "Three full-gym sessions a week to build a base of strength. Add a little weight when every set feels solid.",
        workouts: {
          create: workouts.map((w) => ({
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
      include: { workouts: { include: { exercises: true } } },
    });
  }

  const startsOn = new Date(now - 28 * DAY_MS);
  startsOn.setUTCHours(0, 0, 0, 0);
  await db.programAssignment.upsert({
    where: { programId_clientId: { programId: program.id, clientId: client.userId } },
    create: { programId: program.id, clientId: client.userId, startsOn, assignedAt: new Date(now - 29 * DAY_MS) },
    update: {},
  });

  const existingLogs = await db.workoutLog.count({
    where: { clientId: client.userId, workout: { programId: program.id } },
  });
  if (existingLogs === 0) {
    const repeats = new Map<number, number>();
    for (const [i, session] of sessions.entries()) {
      const plan = workouts[i % workouts.length];
      const workout = program.workouts.find((w) => w.dayNumber === plan.dayNumber);
      if (!workout) continue;
      const k = repeats.get(plan.dayNumber) ?? 0;
      repeats.set(plan.dayNumber, k + 1);

      const completedAt = new Date(now - session.daysAgo * DAY_MS);
      completedAt.setUTCHours(18, 30, 0, 0);
      await db.workoutLog.create({
        data: {
          clientId: client.userId,
          workoutId: workout.id,
          completedAt,
          effort: session.effort,
          notes: session.notes,
          entries: {
            create: plan.exercises.flatMap((e) => {
              const exercise = workout.exercises.find((x) => x.name === e.name);
              if (!exercise) return [];
              return [
                {
                  exerciseId: exercise.id,
                  setsDone: e.sets,
                  reps: repsDone(e.reps, k),
                  weightKg: e.startKg === null ? null : e.startKg + e.stepKg * k,
                },
              ];
            }),
          },
        },
      });
    }
  }

  const note = await db.clientNote.findFirst({
    where: { trainerId: maya.trainerId, clientId: client.userId },
    select: { id: true },
  });
  if (!note) {
    await db.clientNote.create({
      data: {
        trainerId: maya.trainerId,
        clientId: client.userId,
        body: "Goal: deadlift bodyweight by spring. Old lower back niggle, so cue a neutral spine on RDLs and deadlifts.",
        createdAt: new Date(now - 27 * DAY_MS),
      },
    });
  }
}
