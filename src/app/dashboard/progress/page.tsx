import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatDay,
  formatKg,
  personalBests,
  weeklyCounts,
  weeklyStreak,
  workoutsThisWeek,
  type LoggedExercise,
} from "@/lib/progress";
import { getViewerTimeZone } from "./timezone";
import { TimeZoneSync } from "./timezone-sync";
import { PersonalBests, WorkoutHistory } from "./workout-history";

export const metadata: Metadata = { title: "Progress" };

const HISTORY_LIMIT = 50;

export default function ProgressPage({ searchParams }: PageProps<"/dashboard/progress">) {
  return (
    <>
      <PageHeader title="Progress" description="Your logged workouts, streaks and personal bests." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Progress searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Progress({ searchParams }: Pick<PageProps<"/dashboard/progress">, "searchParams">) {
  const [client, { logged }, timeZone] = await Promise.all([
    requireRole("CLIENT"),
    searchParams,
    getViewerTimeZone(),
  ]);

  const logs = await db.workoutLog.findMany({
    where: { clientId: client.id },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      completedAt: true,
      effort: true,
      notes: true,
      workout: { select: { dayNumber: true, title: true, program: { select: { title: true } } } },
      entries: {
        orderBy: [{ exercise: { position: "asc" } }, { id: "asc" }],
        select: { id: true, setsDone: true, reps: true, weightKg: true, exercise: { select: { name: true } } },
      },
    },
  });

  if (logs.length === 0) {
    return (
      <Card className="space-y-2 text-sm">
        <TimeZoneSync />
        <p className="font-medium">No workouts logged yet.</p>
        <p className="text-subtle">
          Open a program from your trainer and tap “Log this workout” after each session. Your streak and
          personal bests show up here.
        </p>
        <Link href="/dashboard/programs" className="inline-block font-medium text-brand">
          Go to my programs
        </Link>
      </Card>
    );
  }

  const now = new Date();
  const dates = logs.map((l) => l.completedAt);
  const entries: LoggedExercise[] = logs.flatMap((log) =>
    log.entries.map((e) => ({
      exerciseName: e.exercise.name,
      completedAt: log.completedAt,
      setsDone: e.setsDone,
      reps: e.reps,
      weightKg: e.weightKg,
    })),
  );
  const bests = personalBests(entries);
  const weeks = weeklyCounts(dates, now, timeZone, 8);
  const busiestWeek = Math.max(1, ...weeks.map((w) => w.count));
  const thisWeek = workoutsThisWeek(dates, now, timeZone);
  const streak = weeklyStreak(dates, now, timeZone);

  const justLogged = logs.find((l) => l.id === logged);
  const newBests = justLogged
    ? bests.filter((b) => b.history.length > 1 && b.maxWeightOn.getTime() === justLogged.completedAt.getTime())
    : [];

  return (
    <div className="space-y-8">
      <TimeZoneSync />
      {justLogged && (
        <Alert tone="success">
          Workout saved. Nice work!
          {newBests.length > 0 &&
            ` New personal best: ${newBests.map((b) => `${b.name} ${formatKg(b.maxWeightKg, 2)}`).join(", ")}.`}
        </Alert>
      )}

      <section aria-label="This week" className="grid grid-cols-3 gap-3">
        <Stat label="This week" value={thisWeek} unit={thisWeek === 1 ? "workout" : "workouts"} />
        <Stat label="Weekly streak" value={streak} unit={streak === 1 ? "week" : "weeks"} />
        <Stat label="All time" value={logs.length} unit={logs.length === 1 ? "workout" : "workouts"} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Last 8 weeks</h2>
        <Card>
          <ol className="flex h-28 items-end gap-2" aria-label="Workouts per week">
            {weeks.map((week) => (
              <li key={week.weekStart.toISOString()} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-medium">{week.count || ""}</span>
                <span
                  aria-hidden
                  className="w-full max-w-10 rounded-t bg-brand/80"
                  style={{ height: `${(week.count / busiestWeek) * 100}%`, minHeight: week.count ? 4 : 1 }}
                />
                <span className="sr-only">
                  Week of {formatDay(week.weekStart, timeZone)}: {week.count} {week.count === 1 ? "workout" : "workouts"}
                </span>
                <span aria-hidden className="whitespace-nowrap text-[10px] text-subtle">
                  {new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(week.weekStart)}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Personal bests</h2>
        {bests.length === 0 ? (
          <p className="text-sm text-subtle">Log a weight on any exercise to start tracking personal bests.</p>
        ) : (
          <PersonalBests bests={bests} timeZone={timeZone} />
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">History</h2>
        <WorkoutHistory logs={logs.slice(0, HISTORY_LIMIT)} timeZone={timeZone} canDelete />
        {logs.length > HISTORY_LIMIT && (
          <p className="mt-3 text-xs text-subtle">
            Showing your {HISTORY_LIMIT} most recent workouts. Older ones still count towards your bests.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="text-xs text-subtle">{unit}</p>
    </Card>
  );
}
