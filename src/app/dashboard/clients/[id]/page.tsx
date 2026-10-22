import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteClientNote } from "@/app/actions/clients";
import { unassignProgram } from "@/app/actions/programs";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { isTrainerClient } from "@/lib/clients";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDay, formatRelativeDay, personalBests } from "@/lib/progress";
import { formatSlot } from "@/lib/scheduling";
import type { BookingStatus } from "@/generated/prisma/client";
import { PersonalBests, WorkoutHistory } from "../../progress/workout-history";
import { AddNoteForm, AssignProgramForm } from "./client-forms";

export const metadata: Metadata = { title: "Client" };

const RECENT_LOGS = 15;

const statusLabels: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

const statusStyles: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  CONFIRMED: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  CANCELLED: "bg-muted text-subtle",
  COMPLETED: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
};

export default function ClientPage({ params }: PageProps<"/dashboard/clients/[id]">) {
  return (
    <>
      <Link href="/dashboard/clients" className="text-sm text-subtle hover:underline">
        ← Clients
      </Link>
      <div className="mt-2">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Client params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function Client({ params }: Pick<PageProps<"/dashboard/clients/[id]">, "params">) {
  const [{ id }, trainerId] = await Promise.all([params, requireTrainerProfileId()]);
  // Only the trainer's own clients; anyone else looks like a missing page.
  if (!(await isTrainerClient(trainerId, id))) notFound();

  const now = new Date();
  const ownWorkouts = { workout: { program: { trainerId } } };
  const [trainer, client, bookings, credits, assignments, programs, logs, notes] = await Promise.all([
    db.trainerProfile.findUniqueOrThrow({ where: { id: trainerId }, select: { timezone: true } }),
    db.user.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, email: true } }),
    db.booking.findMany({
      where: { trainerId, clientId: id, status: { not: "PENDING_PAYMENT" } },
      orderBy: { startsAt: "desc" },
      select: { id: true, startsAt: true, status: true, priceCents: true, currency: true, packagePurchaseId: true },
    }),
    db.packagePurchase.findMany({
      where: { trainerId, clientId: id, status: "ACTIVE", expiresAt: { gt: now } },
      select: { id: true, sessionsTotal: true, sessionsUsed: true, expiresAt: true, package: { select: { title: true } } },
      orderBy: { expiresAt: "asc" },
    }),
    db.programAssignment.findMany({
      where: { clientId: id, program: { trainerId } },
      select: { id: true, startsOn: true, assignedAt: true, program: { select: { id: true, title: true } } },
      orderBy: { assignedAt: "desc" },
    }),
    db.program.findMany({ where: { trainerId }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    // Workouts from this trainer's programs only; other trainers' plans stay private.
    db.workoutLog.findMany({
      where: { clientId: id, ...ownWorkouts },
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
    }),
    db.clientNote.findMany({ where: { trainerId, clientId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  const tz = trainer.timezone;
  const completed = bookings.filter((b) => b.status === "COMPLETED").length;
  const next = bookings.filter((b) => b.status === "CONFIRMED" && b.startsAt > now).at(-1);
  const creditsLeft = credits.reduce((sum, p) => sum + Math.max(0, p.sessionsTotal - p.sessionsUsed), 0);
  const bests = personalBests(
    logs.flatMap((log) =>
      log.entries.map((e) => ({
        exerciseName: e.exercise.name,
        completedAt: log.completedAt,
        setsDone: e.setsDone,
        reps: e.reps,
        weightKg: e.weightKg,
      })),
    ),
  );
  const assignedIds = new Set(assignments.map((a) => a.program.id));
  const assignable = programs.filter((p) => !assignedIds.has(p.id));

  return (
    <>
      <PageHeader
        title={client.name}
        description={client.email}
        action={
          <Link
            href="/dashboard/messages"
            className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Message {client.name.split(" ")[0]}
          </Link>
        }
      />

      <Card className="mb-6">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label="Sessions completed" value={completed} />
          <Stat label="Next session" value={next ? formatSlot(next.startsAt, tz) : "None booked"} />
          <Stat
            label="Package sessions left"
            value={creditsLeft > 0 ? `${creditsLeft} (${credits.map((c) => c.package.title).join(", ")})` : "None"}
          />
          <Stat
            label="Last workout logged"
            value={logs[0] ? formatRelativeDay(logs[0].completedAt, now, tz) : "None yet"}
          />
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="mb-3 font-semibold">Recent workouts</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-subtle">
                No workouts logged yet. {client.name.split(" ")[0]} can log workouts from any program you assign.
              </p>
            ) : (
              <WorkoutHistory logs={logs.slice(0, RECENT_LOGS)} timeZone={tz} />
            )}
          </section>

          {bests.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">Personal bests</h2>
              <PersonalBests bests={bests} timeZone={tz} />
            </section>
          )}

          <section>
            <h2 className="mb-3 font-semibold">Booking history</h2>
            {bookings.length === 0 ? (
              <p className="text-sm text-subtle">No sessions booked yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {bookings.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/bookings/${b.id}`} className="font-medium hover:underline">
                        {formatSlot(b.startsAt, tz)}
                      </Link>
                      <Badge className={statusStyles[b.status]}>{statusLabels[b.status]}</Badge>
                    </div>
                    <span className="text-subtle">
                      {b.packagePurchaseId ? "From a package" : formatMoney(b.priceCents, b.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <Card className="space-y-4">
            <div>
              <h2 className="font-semibold">Private notes</h2>
              <p className="text-xs text-subtle">Only you can see these. {client.name.split(" ")[0]} never does.</p>
            </div>
            <AddNoteForm clientId={client.id} />
            {notes.length > 0 && (
              <ul className="space-y-3" aria-label="Notes">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-lg bg-muted p-3 text-sm">
                    <p className="whitespace-pre-line">{note.body}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-subtle">
                      <span>{formatDay(note.createdAt, tz)}</span>
                      <form action={deleteClientNote.bind(null, note.id)}>
                        <SubmitButton
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          pendingText="Deleting…"
                          aria-label={`Delete note from ${formatDay(note.createdAt, tz)}`}
                        >
                          Delete
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="font-semibold">Programs</h2>
            {assignments.length === 0 ? (
              <p className="text-sm text-subtle">No programs assigned yet.</p>
            ) : (
              <ul className="space-y-2">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/dashboard/programs/${a.program.id}`} className="font-medium hover:underline">
                        {a.program.title}
                      </Link>
                      <p className="text-xs text-subtle">
                        {/* Start dates are calendar dates stored at UTC midnight. */}
                        {a.startsOn
                          ? `${a.startsOn > now ? "Starts" : "Started"} ${formatDay(a.startsOn, "UTC")}`
                          : `Assigned ${formatDay(a.assignedAt, tz)}`}
                      </p>
                    </div>
                    <form action={unassignProgram.bind(null, a.program.id, client.id)}>
                      <SubmitButton
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        pendingText="…"
                        aria-label={`Unassign ${a.program.title}`}
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {assignable.length > 0 ? (
              <AssignProgramForm clientId={client.id} programs={assignable} />
            ) : (
              <p className="text-xs text-subtle">
                {programs.length === 0 ? "You don't have any programs yet. " : "All of your programs are assigned. "}
                <Link href="/dashboard/programs" className="font-medium text-brand">
                  Create a program
                </Link>
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
