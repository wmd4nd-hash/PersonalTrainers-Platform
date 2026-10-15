import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Alert, Badge, Card, Skeleton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getBusyPeriods } from "@/lib/bookings";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { generateSlots } from "@/lib/scheduling";
import { BookingForm, type SlotOption } from "./booking-form";

export default function TrainerPage({ params, searchParams }: PageProps<"/trainers/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TrainerProfile params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TrainerProfile({ params, searchParams }: PageProps<"/trainers/[id]">) {
  const { id } = await params;
  const { cancelled } = await searchParams;

  const trainer = await db.trainerProfile.findFirst({
    where: { id, published: true },
    include: { user: { select: { name: true } }, availability: true },
  });
  if (!trainer) notFound();

  const now = new Date();
  const [viewer, busy] = await Promise.all([getCurrentUser(), getBusyPeriods(trainer.id, now)]);

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: trainer.timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: trainer.timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const slots: SlotOption[] = generateSlots({
    windows: trainer.availability,
    busy,
    timezone: trainer.timezone,
    sessionMinutes: trainer.sessionMinutes,
    now,
  }).map((slot) => ({
    value: slot.toISOString(),
    day: dayLabel.format(slot),
    time: timeLabel.format(slot),
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{trainer.user.name}</h1>
          {trainer.headline && <p className="mt-1 text-lg text-subtle">{trainer.headline}</p>}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-subtle">
          <span>{trainer.city || "Online"}</span>
          <span>{trainer.yearsExperience} years experience</span>
          <span>
            {formatMoney(trainer.sessionRateCents, trainer.currency)} per {trainer.sessionMinutes}
            -minute session
          </span>
        </div>
        {trainer.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {trainer.specialties.map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </div>
        )}
        {trainer.bio && (
          <Card>
            <h2 className="mb-2 font-semibold">About</h2>
            <p className="whitespace-pre-line text-sm leading-6">{trainer.bio}</p>
          </Card>
        )}
      </section>

      <aside>
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold">Book a session</h2>
            <p className="text-xs text-subtle">Times shown in {trainer.timezone}</p>
          </div>
          {cancelled && <Alert>Checkout was cancelled. Your slot has not been booked.</Alert>}
          {!viewer ? (
            <p className="text-sm">
              <Link href="/login" className="font-medium text-brand">
                Log in
              </Link>{" "}
              or{" "}
              <Link href="/signup" className="font-medium text-brand">
                sign up
              </Link>{" "}
              to book.
            </p>
          ) : viewer.role !== "CLIENT" ? (
            <p className="text-sm text-subtle">Only client accounts can book sessions.</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-subtle">No open times in the next four weeks.</p>
          ) : (
            <BookingForm trainerId={trainer.id} slots={slots} />
          )}
        </Card>
      </aside>
    </div>
  );
}
