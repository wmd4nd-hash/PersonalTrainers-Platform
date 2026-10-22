import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteProgram, deleteWorkout, duplicateProgram, unassignProgram } from "@/app/actions/programs";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { trainerClientsWhere } from "@/lib/clients";
import { db } from "@/lib/db";
import { formatDay, formatRelativeDay } from "@/lib/progress";
import { getViewerTimeZone } from "../../progress/timezone";
import { TimeZoneSync } from "../../progress/timezone-sync";
import { ConfirmAction } from "../confirm-action";
import { AddExerciseForm, AddWorkoutForm, AssignForm, ExerciseRow, ProgramHeader } from "./program-forms";

export const metadata: Metadata = { title: "Program" };

export default function ProgramPage({ params, searchParams }: PageProps<"/dashboard/programs/[id]">) {
  return (
    <>
      <Link href="/dashboard/programs" className="text-sm text-subtle hover:underline">
        ← Programs
      </Link>
      <div className="mt-2">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Program params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function Program({ params, searchParams }: PageProps<"/dashboard/programs/[id]">) {
  const [{ id }, { copied }, user] = await Promise.all([params, searchParams, requireUser()]);

  const program = await db.program.findFirst({
    where: {
      id,
      OR: [{ trainer: { userId: user.id } }, { assignments: { some: { clientId: user.id } } }],
    },
    include: {
      trainer: { select: { id: true, userId: true, user: { select: { name: true } } } },
      workouts: {
        orderBy: [{ dayNumber: "asc" }, { id: "asc" }],
        include: {
          exercises: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: { _count: { select: { logs: true } } },
          },
          _count: { select: { logs: true } },
        },
      },
    },
  });
  if (!program) notFound();

  return program.trainer.userId === user.id ? (
    <OwnerView program={program} justCopied={copied === "1"} />
  ) : (
    <ClientView program={program} user={user} />
  );
}

type ProgramWithWorkouts = {
  id: string;
  title: string;
  description: string;
  trainer: { id: string; user: { name: string } };
  workouts: {
    id: string;
    dayNumber: number;
    title: string;
    notes: string;
    _count: { logs: number };
    exercises: {
      id: string;
      name: string;
      sets: number;
      reps: string;
      restSeconds: number;
      _count: { logs: number };
    }[];
  }[];
};

async function OwnerView({ program, justCopied }: { program: ProgramWithWorkouts; justCopied: boolean }) {
  const [assignments, clients, logCount] = await Promise.all([
    db.programAssignment.findMany({
      where: { programId: program.id },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { assignedAt: "asc" },
    }),
    db.user.findMany({
      where: trainerClientsWhere(program.trainer.id),
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.workoutLog.count({ where: { workout: { programId: program.id } } }),
  ]);
  const assignedIds = new Set(assignments.map((a) => a.clientId));
  const now = new Date();

  return (
    <>
      <ProgramHeader
        program={{ id: program.id, title: program.title, description: program.description }}
        actions={
          <form action={duplicateProgram.bind(null, program.id)}>
            <SubmitButton variant="secondary" pendingText="Duplicating…">
              Duplicate
            </SubmitButton>
          </form>
        }
      />
      {justCopied && (
        <div className="mb-6">
          <Alert tone="success">Program duplicated. You&apos;re now editing the copy.</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="min-w-0 space-y-4" aria-label="Workouts">
          {program.workouts.length === 0 && (
            <p className="text-sm text-subtle">No workouts yet. Add the first one below.</p>
          )}
          {program.workouts.map((workout) => (
            <Card key={workout.id} role="group" aria-label={workoutLabel(workout)} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <WorkoutHeading workout={workout} />
                <ConfirmAction
                  action={deleteWorkout.bind(null, program.id, workout.id)}
                  label="Delete"
                  ariaLabel={`Delete workout ${workout.title}`}
                  buttonClassName="px-3 py-1 text-xs"
                  confirmLabel="Delete workout"
                  pendingText="Deleting…"
                  message={`Delete “${workout.title}” and its exercises?${
                    workout._count.logs > 0
                      ? ` This also deletes ${plural(workout._count.logs, "logged workout")} from your clients' progress.`
                      : ""
                  }`}
                />
              </div>

              {workout.exercises.length > 0 && (
                <ul className="divide-y divide-line" aria-label={`Exercises in ${workout.title}`}>
                  {workout.exercises.map(({ _count, ...exercise }, i) => (
                    <ExerciseRow
                      key={exercise.id}
                      programId={program.id}
                      exercise={exercise}
                      loggedSets={_count.logs}
                      isFirst={i === 0}
                      isLast={i === workout.exercises.length - 1}
                    />
                  ))}
                </ul>
              )}

              <AddExerciseForm programId={program.id} workoutId={workout.id} />
            </Card>
          ))}

          <Card>
            <h2 className="mb-4 font-semibold">Add a workout</h2>
            <AddWorkoutForm programId={program.id} nextDay={(program.workouts.at(-1)?.dayNumber ?? 0) + 1} />
          </Card>
        </section>

        <aside className="space-y-6">
          <Card className="space-y-4">
            <h2 className="font-semibold">Assigned clients</h2>
            {assignments.length === 0 ? (
              <p className="text-sm text-subtle">Not assigned to anyone yet.</p>
            ) : (
              <ul className="space-y-2">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/dashboard/clients/${a.clientId}`} className="font-medium hover:underline">
                        {a.client.name}
                      </Link>
                      <p className="text-xs text-subtle">{startLabel(a.startsOn, a.assignedAt, now)}</p>
                    </div>
                    <form action={unassignProgram.bind(null, program.id, a.clientId)}>
                      <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Unassign ${a.client.name}`}>
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <AssignForm
              programId={program.id}
              clients={clients.filter((c) => !assignedIds.has(c.id))}
              hasClients={clients.length > 0}
            />
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">Delete program</h2>
            <ConfirmAction
              action={deleteProgram.bind(null, program.id)}
              label="Delete program"
              confirmLabel="Yes, delete it"
              pendingText="Deleting…"
              message={
                <>
                  Delete “{program.title}” for good? Its workouts and client assignments go with it
                  {logCount > 0 && (
                    <>
                      , along with <strong>{plural(logCount, "logged workout")}</strong>{" "}
                      in your clients&apos; progress
                    </>
                  )}
                  . Duplicate it first if you might want it back.
                </>
              }
            />
          </Card>
        </aside>
      </div>
    </>
  );
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function startLabel(startsOn: Date | null, assignedAt: Date, now: Date) {
  // Start dates are calendar dates stored at UTC midnight.
  if (startsOn) return `${startsOn > now ? "Starts" : "Started"} ${formatDay(startsOn, "UTC")}`;
  return `Assigned ${formatDay(assignedAt, "UTC")}`;
}

function workoutLabel(workout: { dayNumber: number; title: string }) {
  return `Day ${workout.dayNumber}: ${workout.title}`;
}

function WorkoutHeading({ workout }: { workout: { dayNumber: number; title: string; notes: string } }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-brand">Day {workout.dayNumber}</p>
      <h2 className="font-semibold">{workout.title}</h2>
      {workout.notes && <p className="mt-1 whitespace-pre-line text-sm text-subtle">{workout.notes}</p>}
    </div>
  );
}

async function ClientView({ program, user }: { program: ProgramWithWorkouts; user: CurrentUser }) {
  const workoutIds = program.workouts.map((w) => w.id);
  const [assignment, history, timeZone] = await Promise.all([
    db.programAssignment.findUnique({
      where: { programId_clientId: { programId: program.id, clientId: user.id } },
      select: { startsOn: true },
    }),
    db.workoutLog.groupBy({
      by: ["workoutId"],
      where: { clientId: user.id, workoutId: { in: workoutIds } },
      _max: { completedAt: true },
      _count: { _all: true },
    }),
    getViewerTimeZone(),
  ]);
  const historyBy = new Map(history.map((h) => [h.workoutId, h]));
  const now = new Date();
  const startsLater = assignment?.startsOn && assignment.startsOn > now;

  return (
    <>
      <TimeZoneSync />
      <PageHeader title={program.title} description={`By ${program.trainer.user.name}`} />
      {program.description && <p className="-mt-3 mb-6 whitespace-pre-line text-sm">{program.description}</p>}
      {startsLater && (
        <div className="mb-6">
          <Alert tone="success">
            Your trainer set this program to start on {formatDay(assignment.startsOn!, "UTC")}. You can log
            workouts any time.
          </Alert>
        </div>
      )}

      <section className="space-y-4" aria-label="Workouts">
        {program.workouts.length === 0 && (
          <p className="text-sm text-subtle">Your trainer hasn&apos;t added workouts to this program yet.</p>
        )}
        {program.workouts.map((workout) => {
          const done = historyBy.get(workout.id);
          const lastDone = done?._max.completedAt;
          return (
            <Card key={workout.id} role="group" aria-label={workoutLabel(workout)} className="space-y-3">
              <WorkoutHeading workout={workout} />
              {workout.exercises.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-subtle">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Exercise</th>
                        <th className="py-1 pr-3 font-medium">Sets</th>
                        <th className="py-1 pr-3 font-medium">Reps</th>
                        <th className="py-1 font-medium">Rest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {workout.exercises.map((ex) => (
                        <tr key={ex.id}>
                          <td className="py-2 pr-3">{ex.name}</td>
                          <td className="py-2 pr-3">{ex.sets}</td>
                          <td className="py-2 pr-3">{ex.reps}</td>
                          <td className="py-2">{ex.restSeconds}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-sm text-subtle">
                  {lastDone
                    ? `Last done ${formatRelativeDay(lastDone, now, timeZone)}${
                        done._count._all > 1 ? ` · ${done._count._all} times so far` : ""
                      }`
                    : "Not done yet"}
                </p>
                <Link
                  href={`/dashboard/progress/log/${workout.id}`}
                  className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                  aria-label={`Log this workout: ${workoutLabel(workout)}`}
                >
                  Log this workout
                </Link>
              </div>
            </Card>
          );
        })}
      </section>
    </>
  );
}
