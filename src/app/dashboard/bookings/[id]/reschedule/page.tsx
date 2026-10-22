import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LocalTime } from "@/components/scheduling/local-time";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getBusyPeriods } from "@/lib/bookings";
import { db } from "@/lib/db";
import {
  formatSlotRange,
  generateSlots,
  labelSlots,
  reschedulePolicy,
  upcomingDateKeys,
} from "@/lib/scheduling";
import { RescheduleForm } from "./reschedule-form";

export const metadata: Metadata = { title: "Reschedule session" };

export default function ReschedulePage({ params }: PageProps<"/dashboard/bookings/[id]/reschedule">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Reschedule params={params} />
    </Suspense>
  );
}

async function Reschedule({ params }: Pick<PageProps<"/dashboard/bookings/[id]/reschedule">, "params">) {
  const { id } = await params;
  const user = await requireUser();
  const booking = await db.booking.findFirst({
    where: { id, OR: [{ clientId: user.id }, { trainer: { userId: user.id } }] },
    include: {
      client: { select: { name: true } },
      trainer: { include: { availability: true, user: { select: { name: true } } } },
    },
  });
  if (!booking) notFound();

  const now = new Date();
  const { trainer } = booking;
  const isTrainer = trainer.userId === user.id;
  const otherName = isTrainer ? booking.client.name : trainer.user.name;
  const back = `/dashboard/bookings/${booking.id}`;

  const policy =
    booking.status === "CONFIRMED"
      ? reschedulePolicy({
          actor: isTrainer ? "TRAINER" : "CLIENT",
          startsAt: booking.startsAt,
          now,
          windowHours: trainer.cancellationWindowHours,
        })
      : { allowed: false as const, reason: "Only confirmed sessions can be moved." };

  // Same length as booked; the session's own time doesn't count as busy.
  const minutes = Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000);
  const slots = policy.allowed
    ? generateSlots({
        windows: trainer.availability,
        busy: await getBusyPeriods(trainer.id, now, db, { excludeBookingId: booking.id }),
        timezone: trainer.timezone,
        sessionMinutes: minutes,
        now,
        minNoticeMinutes: trainer.minNoticeHours * 60,
      }).filter((slot) => slot.getTime() !== booking.startsAt.getTime())
    : [];

  return (
    <>
      <Link href={back} className="text-sm text-subtle hover:underline">
        ← Back to the session
      </Link>
      <div className="mt-2">
        <PageHeader
          title="Reschedule session"
          description={`Pick a new time with ${isTrainer ? otherName : trainer.user.name}. Times are in ${trainer.timezone}.`}
        />
      </div>

      <div className="max-w-2xl space-y-4">
        <Card className="text-sm">
          <p className="text-subtle">Current time</p>
          <p className="font-medium">{formatSlotRange(booking.startsAt, booking.endsAt, trainer.timezone)}</p>
          <LocalTime start={booking.startsAt} end={booking.endsAt} timezone={trainer.timezone} className="text-subtle" />
        </Card>

        <Card>
          {!policy.allowed ? (
            <p className="text-sm">
              {policy.reason}{" "}
              <Link href={back} className="font-medium text-brand hover:underline">
                Back to the session
              </Link>
            </p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-subtle">
              There are no other free times in the next four weeks.{" "}
              {isTrainer ? "Add more availability first." : `Message ${trainer.user.name} to find a time.`}
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-subtle">
                {isTrainer
                  ? `We'll let ${otherName} know about the new time by email.`
                  : `We'll let ${trainer.user.name} know about the new time. Your payment stays the same.`}
              </p>
              <RescheduleForm
                bookingId={booking.id}
                slots={labelSlots(slots, trainer.timezone)}
                timezone={trainer.timezone}
                dates={upcomingDateKeys(now, trainer.timezone)}
              />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
