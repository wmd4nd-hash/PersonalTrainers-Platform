import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { notify } from "./notify";

type Tx = Prisma.TransactionClient;

/**
 * A trainer's clients: everyone who has booked a session or bought a package
 * with them. Unpaid checkouts that never went through don't count.
 */
export function trainerClientsWhere(trainerId: string): Prisma.UserWhereInput {
  return {
    role: "CLIENT",
    OR: [
      { bookings: { some: { trainerId, status: { not: "PENDING_PAYMENT" } } } },
      { purchases: { some: { trainerId, status: { not: "PENDING_PAYMENT" } } } },
    ],
  };
}

export async function isTrainerClient(trainerId: string, clientId: string, client: Tx = db) {
  const count = await client.user.count({ where: { AND: [{ id: clientId }, trainerClientsWhere(trainerId)] } });
  return count > 0;
}

export type ClientSummary = {
  id: string;
  name: string;
  email: string;
  sessionsCompleted: number;
  nextSessionAt: Date | null;
  packageSessionsLeft: number;
  lastWorkoutAt: Date | null;
};

/** The trainer's clients with headline numbers, optionally filtered by name or email. */
export async function listTrainerClients(
  trainerId: string,
  { search = "", now = new Date() }: { search?: string; now?: Date } = {},
): Promise<ClientSummary[]> {
  const query = search.trim();
  const clients = await db.user.findMany({
    where: {
      AND: [
        trainerClientsWhere(trainerId),
        query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  if (clients.length === 0) return [];
  const clientId = { in: clients.map((c) => c.id) };

  const [completed, upcoming, purchases, workouts] = await Promise.all([
    db.booking.groupBy({
      by: ["clientId"],
      where: { trainerId, clientId, status: "COMPLETED" },
      _count: { _all: true },
    }),
    db.booking.groupBy({
      by: ["clientId"],
      where: { trainerId, clientId, status: "CONFIRMED", startsAt: { gt: now } },
      _min: { startsAt: true },
    }),
    db.packagePurchase.findMany({
      where: { trainerId, clientId, status: "ACTIVE", expiresAt: { gt: now } },
      select: { clientId: true, sessionsTotal: true, sessionsUsed: true },
    }),
    // Only workouts from this trainer's programs: other trainers' plans stay private.
    db.workoutLog.groupBy({
      by: ["clientId"],
      where: { clientId, workout: { program: { trainerId } } },
      _max: { completedAt: true },
    }),
  ]);

  const completedBy = new Map(completed.map((r) => [r.clientId, r._count._all]));
  const nextBy = new Map(upcoming.map((r) => [r.clientId, r._min.startsAt]));
  const lastWorkoutBy = new Map(workouts.map((r) => [r.clientId, r._max.completedAt]));
  const creditsBy = new Map<string, number>();
  for (const p of purchases) {
    const left = Math.max(0, p.sessionsTotal - p.sessionsUsed);
    creditsBy.set(p.clientId, (creditsBy.get(p.clientId) ?? 0) + left);
  }

  return clients.map((c) => ({
    ...c,
    sessionsCompleted: completedBy.get(c.id) ?? 0,
    nextSessionAt: nextBy.get(c.id) ?? null,
    packageSessionsLeft: creditsBy.get(c.id) ?? 0,
    lastWorkoutAt: lastWorkoutBy.get(c.id) ?? null,
  }));
}

export type AssignResult = { ok: true } | { error: string };

/**
 * Assigns one of the trainer's programs to one of their clients, or updates the
 * start date if it is already assigned. Both ids are checked against the trainer.
 */
export async function assignProgramToClient({
  trainerId,
  programId,
  clientId,
  startsOn,
}: {
  trainerId: string;
  programId: string;
  clientId: string;
  startsOn: Date | null;
}): Promise<AssignResult> {
  const [program, isClient] = await Promise.all([
    db.program.findFirst({
      where: { id: programId, trainerId },
      select: { id: true, title: true, trainer: { select: { user: { select: { name: true } } } } },
    }),
    isTrainerClient(trainerId, clientId),
  ]);
  if (!program) return { error: "Choose one of your programs" };
  if (!isClient) return { error: "Choose one of your clients" };

  const where = { programId_clientId: { programId, clientId } };
  const existing = await db.programAssignment.findUnique({ where, select: { id: true } });
  if (existing) {
    await db.programAssignment.update({ where, data: { startsOn } });
    return { ok: true };
  }

  try {
    await db.programAssignment.create({ data: { programId, clientId, startsOn } });
  } catch (err) {
    // Assigned by a parallel request a moment ago: same outcome.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: true };
    throw err;
  }

  await notify({
    userId: clientId,
    type: "program.assigned",
    title: `${program.trainer.user.name} gave you a program`,
    body: `“${program.title}” is ready in My programs.`,
    link: `/dashboard/programs/${program.id}`,
    email: true,
  });
  return { ok: true };
}
