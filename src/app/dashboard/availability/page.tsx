import type { Metadata } from "next";
import { Suspense } from "react";
import { deleteAvailability } from "@/app/actions/trainer";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import { DAY_NAMES, formatTimeOfDay } from "@/lib/scheduling";
import { AddWindowForm } from "./add-window-form";

export const metadata: Metadata = { title: "Availability" };

export default function AvailabilityPage() {
  return (
    <>
      <PageHeader
        title="Weekly availability"
        description="Clients can book sessions that fit inside these windows, up to four weeks ahead."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Availability />
      </Suspense>
    </>
  );
}

async function Availability() {
  const trainerId = await requireTrainerProfileId();
  const profile = await db.trainerProfile.findUniqueOrThrow({
    where: { id: trainerId },
    select: {
      timezone: true,
      availability: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-1 font-semibold">Add a window</h2>
        <p className="mb-4 text-sm text-subtle">Times are in your timezone ({profile.timezone}).</p>
        <AddWindowForm />
      </Card>

      {profile.availability.length === 0 ? (
        <p className="text-sm text-subtle">You haven&apos;t added any availability yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {profile.availability.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="text-sm">
                <span className="inline-block w-28 font-medium">{DAY_NAMES[w.dayOfWeek]}</span>
                {formatTimeOfDay(w.startMinute)} – {formatTimeOfDay(w.endMinute)}
              </span>
              <form action={deleteAvailability.bind(null, w.id)}>
                <Button variant="ghost" className="text-sm">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
