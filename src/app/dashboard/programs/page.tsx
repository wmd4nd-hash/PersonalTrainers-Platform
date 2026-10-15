import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateProgramForm } from "./create-program-form";

export const metadata: Metadata = { title: "Programs" };

export default function ProgramsPage() {
  return (
    <>
      <PageHeader title="Programs" />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Programs />
      </Suspense>
    </>
  );
}

async function Programs() {
  const user = await requireUser();

  if (user.role === "CLIENT") {
    const assignments = await db.programAssignment.findMany({
      where: { clientId: user.id },
      include: {
        program: {
          select: {
            id: true,
            title: true,
            description: true,
            trainer: { select: { user: { select: { name: true } } } },
            _count: { select: { workouts: true } },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });
    if (assignments.length === 0) {
      return (
        <p className="text-sm text-subtle">
          Your trainer hasn&apos;t assigned you a program yet. Programs appear here once they do.
        </p>
      );
    }
    return (
      <ProgramGrid
        programs={assignments.map(({ program }) => ({
          id: program.id,
          title: program.title,
          description: program.description,
          meta: `${program._count.workouts} workouts · by ${program.trainer.user.name}`,
        }))}
      />
    );
  }

  const programs = await db.program.findMany({
    where: { trainer: { userId: user.id } },
    include: { _count: { select: { workouts: true, assignments: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 font-semibold">New program</h2>
        <CreateProgramForm />
      </Card>
      {programs.length === 0 ? (
        <p className="text-sm text-subtle">No programs yet.</p>
      ) : (
        <ProgramGrid
          programs={programs.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            meta: `${p._count.workouts} workouts · ${p._count.assignments} clients`,
          }))}
        />
      )}
    </div>
  );
}

function ProgramGrid({
  programs,
}: {
  programs: { id: string; title: string; description: string; meta: string }[];
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {programs.map((p) => (
        <li key={p.id}>
          <Link href={`/dashboard/programs/${p.id}`} className="block h-full">
            <Card className="h-full transition-colors hover:border-brand">
              <h3 className="font-semibold">{p.title}</h3>
              {p.description && <p className="mt-1 line-clamp-2 text-sm text-subtle">{p.description}</p>}
              <p className="mt-3 text-xs text-subtle">{p.meta}</p>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
