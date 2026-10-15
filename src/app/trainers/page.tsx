import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Button, Card, Input, PageHeader, Skeleton } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Find a trainer" };

export default function TrainersPage({ searchParams }: PageProps<"/trainers">) {
  return (
    <>
      <PageHeader
        title="Find a trainer"
        description="Search by name, specialty or city."
      />
      <Suspense fallback={<TrainerListSkeleton />}>
        <TrainerResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

async function TrainerResults({ searchParams }: Pick<PageProps<"/trainers">, "searchParams">) {
  const params = await searchParams;
  const q = first(params.q);
  const city = first(params.city);

  const trainers = await db.trainerProfile.findMany({
    where: {
      published: true,
      ...(city && { city: { contains: city, mode: "insensitive" } }),
      ...(q && {
        OR: [
          { user: { name: { contains: q, mode: "insensitive" } } },
          { headline: { contains: q, mode: "insensitive" } },
          { specialties: { has: q.toLowerCase() } },
        ],
      }),
    },
    include: { user: { select: { name: true } } },
    orderBy: { yearsExperience: "desc" },
    take: 50,
  });

  return (
    <>
      <form className="mb-6 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Name or specialty, e.g. strength" className="sm:max-w-xs" />
        <Input name="city" defaultValue={city} placeholder="City" className="sm:max-w-48" />
        <Button type="submit">Search</Button>
      </form>

      {trainers.length === 0 ? (
        <Card className="text-center text-sm text-subtle">
          No trainers match your search yet.
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trainers.map((t) => (
            <li key={t.id}>
              <Link href={`/trainers/${t.id}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-brand">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{t.user.name}</h2>
                      <p className="text-sm text-subtle">{t.city || "Online"}</p>
                    </div>
                    <p className="text-sm font-medium">
                      {formatMoney(t.sessionRateCents, t.currency)}
                      <span className="text-subtle"> / {t.sessionMinutes} min</span>
                    </p>
                  </div>
                  {t.headline && <p className="mt-3 text-sm">{t.headline}</p>}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {t.specialties.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TrainerListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-36" />
      ))}
    </div>
  );
}
