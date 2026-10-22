import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatRelativeDay } from "@/lib/progress";
import { getViewerTimeZone } from "../../timezone";
import { TimeZoneSync } from "../../timezone-sync";
import { LogWorkoutForm } from "./log-form";

export const metadata: Metadata = { title: "Log a workout" };

export default function LogWorkoutPage({ params }: PageProps<"/dashboard/progress/log/[workoutId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <LogWorkout params={params} />
    </Suspense>
  );
}

async function LogWorkout({ params }: Pick<PageProps<"/dashboard/progress/log/[workoutId]">, "params">) {
  const [{ workoutId }, client] = await Promise.all([params, requireRole("CLIENT")]);

  // Only workouts from programs assigned to this client.
  const workout = await db.workout.findFirst({
    where: { id: workoutId, program: { assignments: { some: { clientId: client.id } } } },
    include: {
      program: { select: { id: true, title: true } },
      exercises: { orderBy: [{ position: "asc" }, { id: "asc" }] },
    },
  });
  if (!workout) notFound();

  const [lastLog, timeZone] = await Promise.all([
    db.workoutLog.findFirst({
      where: { clientId: client.id, workoutId: workout.id },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, entries: { select: { exerciseId: true, setsDone: true, reps: true, weightKg: true } } },
    }),
    getViewerTimeZone(),
  ]);
  const lastBy = new Map(lastLog?.entries.map((e) => [e.exerciseId, e]));

  return (
    <>
      <TimeZoneSync />
      <Link href={`/dashboard/programs/${workout.program.id}`} className="text-sm text-subtle hover:underline">
        ← {workout.program.title}
      </Link>
      <div className="mt-2">
        <PageHeader
          title={`Day ${workout.dayNumber}: ${workout.title}`}
          description={
            lastLog
              ? `Last done ${formatRelativeDay(lastLog.completedAt, new Date(), timeZone)}. Your numbers from then are filled in.`
              : "Record what you did. You can leave the weight empty for bodyweight exercises."
          }
        />
      </div>
      {workout.notes && <p className="-mt-3 mb-6 whitespace-pre-line text-sm">{workout.notes}</p>}

      <div className="max-w-2xl">
        <LogWorkoutForm
          workoutId={workout.id}
          exercises={workout.exercises.map((ex) => {
            const last = lastBy.get(ex.id);
            return {
              id: ex.id,
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              restSeconds: ex.restSeconds,
              last: last ? { setsDone: last.setsDone, reps: last.reps, weightKg: last.weightKg } : null,
            };
          })}
        />
      </div>
    </>
  );
}
