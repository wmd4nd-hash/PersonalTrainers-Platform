import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { cancelBooking, completeBooking } from "@/app/actions/bookings";
import { Alert, Badge, Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatSlot } from "@/lib/scheduling";
import type { BookingStatus, Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Dashboard" };

const statusStyles: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  CONFIRMED: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  CANCELLED: "bg-muted text-subtle",
  COMPLETED: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
};

const statusLabels: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader title="Bookings" />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Bookings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Bookings({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const user = await requireUser();
  const { booked } = await searchParams;

  const bookings = await db.booking.findMany({
    where:
      user.role === "TRAINER"
        ? { trainer: { userId: user.id }, status: { not: "PENDING_PAYMENT" } }
        : { clientId: user.id },
    include: bookingInclude,
    orderBy: { startsAt: "asc" },
  });

  const now = new Date();
  const upcoming = bookings.filter((b) => b.endsAt > now && b.status !== "CANCELLED");
  const past = bookings.filter((b) => !upcoming.includes(b)).reverse();
  const justBooked = bookings.find((b) => b.id === booked);

  return (
    <div className="space-y-8">
      {justBooked && (
        <Alert tone="success">
          {justBooked.status === "PENDING_PAYMENT"
            ? "Thanks! We're confirming your payment. This page will show the booking as confirmed shortly."
            : "Your session is booked."}
        </Alert>
      )}
      <BookingSection title="Upcoming" bookings={upcoming} user={user} now={now} empty={
        user.role === "TRAINER" ? (
          "No upcoming sessions. Make sure your profile is published and your availability is set."
        ) : (
          <>
            No upcoming sessions.{" "}
            <Link href="/trainers" className="font-medium text-brand">
              Find a trainer
            </Link>
          </>
        )
      } />
      <BookingSection title="Past and cancelled" bookings={past} user={user} now={now} empty="Nothing here yet." />
    </div>
  );
}

const bookingInclude = {
  client: { select: { name: true, email: true } },
  trainer: { select: { id: true, timezone: true, user: { select: { name: true } } } },
} satisfies Prisma.BookingInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

function BookingSection({
  title,
  bookings,
  user,
  now,
  empty,
}: {
  title: string;
  bookings: BookingRow[];
  user: CurrentUser;
  now: Date;
  empty: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {bookings.length === 0 ? (
        <p className="text-sm text-subtle">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const canCancel = ["PENDING_PAYMENT", "CONFIRMED"].includes(b.status) && b.startsAt > now;
            const canComplete = user.role === "TRAINER" && b.status === "CONFIRMED" && b.startsAt < now;
            return (
              <li key={b.id}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{formatSlot(b.startsAt, b.trainer.timezone)}</p>
                      <Badge className={statusStyles[b.status]}>{statusLabels[b.status]}</Badge>
                    </div>
                    <p className="text-sm text-subtle">
                      {user.role === "TRAINER" ? (
                        <>
                          {b.client.name} · {b.client.email}
                        </>
                      ) : (
                        <Link href={`/trainers/${b.trainer.id}`} className="hover:underline">
                          with {b.trainer.user.name}
                        </Link>
                      )}{" "}
                      · {formatMoney(b.priceCents, b.currency)}
                    </p>
                    {b.notes && <p className="text-sm">“{b.notes}”</p>}
                  </div>
                  <div className="flex gap-2">
                    {canComplete && (
                      <form action={completeBooking.bind(null, b.id)}>
                        <Button variant="secondary">Mark completed</Button>
                      </form>
                    )}
                    {canCancel && (
                      <form action={cancelBooking.bind(null, b.id)}>
                        <Button variant="danger">Cancel</Button>
                      </form>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
