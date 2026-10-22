import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { Button, Card, Input, PageHeader, Skeleton } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { listTrainerClients } from "@/lib/clients";
import { db } from "@/lib/db";
import { formatRelativeDay } from "@/lib/progress";
import { formatSlot } from "@/lib/scheduling";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage({ searchParams }: PageProps<"/dashboard/clients">) {
  return (
    <>
      <PageHeader title="Clients" description="Everyone who has booked a session or bought a package with you." />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Clients searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Clients({ searchParams }: Pick<PageProps<"/dashboard/clients">, "searchParams">) {
  const [trainerId, { q }] = await Promise.all([requireTrainerProfileId(), searchParams]);
  const search = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const now = new Date();
  const [trainer, clients] = await Promise.all([
    db.trainerProfile.findUniqueOrThrow({ where: { id: trainerId }, select: { timezone: true } }),
    listTrainerClients(trainerId, { search, now }),
  ]);

  if (clients.length === 0 && !search) {
    return (
      <Card className="text-sm text-subtle">
        No clients yet. People appear here once they book a session or buy a package with you.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Form action="/dashboard/clients" role="search" className="flex gap-2">
        <label htmlFor="client-search" className="sr-only">
          Search clients by name
        </label>
        <Input id="client-search" name="q" type="search" placeholder="Search by name or email" defaultValue={search} />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </Form>

      {clients.length === 0 ? (
        <p className="text-sm text-subtle">
          No clients match “{search}”.{" "}
          <Link href="/dashboard/clients" className="font-medium text-brand">
            Show everyone
          </Link>
        </p>
      ) : (
        <ul className="space-y-3" aria-label="Your clients">
          {clients.map((client) => (
            <li key={client.id}>
              <Card className="space-y-3">
                <div className="min-w-0">
                  <Link href={`/dashboard/clients/${client.id}`} className="font-semibold hover:underline">
                    {client.name}
                  </Link>
                  <p className="truncate text-sm text-subtle">{client.email}</p>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Stat label="Sessions completed" value={client.sessionsCompleted} />
                  <Stat
                    label="Next session"
                    value={client.nextSessionAt ? formatSlot(client.nextSessionAt, trainer.timezone) : "None booked"}
                  />
                  <Stat
                    label="Package sessions left"
                    value={client.packageSessionsLeft > 0 ? client.packageSessionsLeft : "None"}
                  />
                  <Stat
                    label="Last workout logged"
                    value={client.lastWorkoutAt ? formatRelativeDay(client.lastWorkoutAt, now, trainer.timezone) : "None yet"}
                  />
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
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
