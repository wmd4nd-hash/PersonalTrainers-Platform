import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteExercise, deleteWorkout, unassignProgram } from "@/app/actions/programs";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AddExerciseForm, AddWorkoutForm, AssignForm } from "./program-forms";

export default function ProgramPage({ params }: PageProps<"/dashboard/programs/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Program params={params} />
    </Suspense>
  );
}

async function Program({ params }: Pick<PageProps<"/dashboard/programs/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser();

  const program = await db.program.findFirst({
    where: {
      id,
      OR: [{ trainer: { userId: user.id } }, { assignments: { some: { clientId: user.id } } }],
    },
    include: {
      trainer: { select: { id: true, userId: true, user: { select: { name: true } } } },
      workouts: {
        orderBy: { dayNumber: "asc" },
        include: { exercises: { orderBy: { position: "asc" } } },
      },
      assignments: { include: { client: { select: { id: true, name: true } } } },
    },
  });
  if (!program) notFound();

  const isOwner = program.trainer.userId === user.id;
  const clients = isOwner
    ? await db.user.findMany({
        where: { role: "CLIENT", bookings: { some: { trainerId: program.trainer.id } } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];
  const assignedIds = new Set(program.assignments.map((a) => a.clientId));

  return (
    <>
      <Link href="/dashboard/programs" className="text-sm text-subtle hover:underline">
        ← Programs
      </Link>
      <div className="mt-2">
        <PageHeader
          title={program.title}
          description={isOwner ? program.description : `By ${program.trainer.user.name}`}
        />
      </div>
      {!isOwner && program.description && (
        <p className="-mt-4 mb-6 whitespace-pre-line text-sm">{program.description}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="space-y-4">
          {program.workouts.length === 0 && (
            <p className="text-sm text-subtle">No workouts in this program yet.</p>
          )}
          {program.workouts.map((workout) => (
            <Card key={workout.id} className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-brand">
                    Day {workout.dayNumber}
                  </p>
                  <h2 className="font-semibold">{workout.title}</h2>
                  {workout.notes && <p className="mt-1 text-sm text-subtle">{workout.notes}</p>}
                </div>
                {isOwner && (
                  <form action={deleteWorkout.bind(null, program.id, workout.id)}>
                    <Button variant="ghost" className="text-sm">
                      Delete
                    </Button>
                  </form>
                )}
              </div>

              {workout.exercises.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-subtle">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Exercise</th>
                        <th className="py-1 pr-3 font-medium">Sets</th>
                        <th className="py-1 pr-3 font-medium">Reps</th>
                        <th className="py-1 pr-3 font-medium">Rest</th>
                        {isOwner && <th className="sr-only">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {workout.exercises.map((ex) => (
                        <tr key={ex.id}>
                          <td className="py-2 pr-3">{ex.name}</td>
                          <td className="py-2 pr-3">{ex.sets}</td>
                          <td className="py-2 pr-3">{ex.reps}</td>
                          <td className="py-2 pr-3">{ex.restSeconds}s</td>
                          {isOwner && (
                            <td className="py-2 text-right">
                              <form action={deleteExercise.bind(null, program.id, ex.id)}>
                                <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Remove ${ex.name}`}>
                                  ✕
                                </Button>
                              </form>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {isOwner && <AddExerciseForm programId={program.id} workoutId={workout.id} />}
            </Card>
          ))}

          {isOwner && (
            <Card>
              <h2 className="mb-4 font-semibold">Add a workout</h2>
              <AddWorkoutForm
                programId={program.id}
                nextDay={(program.workouts.at(-1)?.dayNumber ?? 0) + 1}
              />
            </Card>
          )}
        </section>

        {isOwner && (
          <aside>
            <Card className="space-y-4">
              <h2 className="font-semibold">Assigned clients</h2>
              {program.assignments.length === 0 ? (
                <p className="text-sm text-subtle">Not assigned to anyone yet.</p>
              ) : (
                <ul className="space-y-2">
                  {program.assignments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-sm">
                      {a.client.name}
                      <form action={unassignProgram.bind(null, program.id, a.clientId)}>
                        <Button variant="ghost" className="px-2 py-1 text-xs">
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
              />
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
