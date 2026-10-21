import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { completeBooking } from "@/app/actions/bookings";
import { Avatar } from "@/components/avatar";
import { BookingStatusBadge, formatLabels } from "@/components/scheduling/booking-status";
import { CancelBookingForm } from "@/components/scheduling/cancel-booking-form";
import { JoinCallLink } from "@/components/scheduling/join-call-link";
import { LinkButton } from "@/components/scheduling/link-button";
import { LocalTime } from "@/components/scheduling/local-time";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, PageHeader, Skeleton, cx } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser, type CurrentUser } from "@/lib/auth";
import {
  BOOKING_TABS,
  bookingTabWhere,
  parseBookingTab,
  participantWhere,
  type BookingTab,
} from "@/lib/bookings";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatSlot, formatSlotRange, resolveWeek } from "@/lib/scheduling";
import { joinUrl, sessionPhase } from "@/lib/sessions";
import { BookingReviewAction } from "./_components/booking-review-action";
import { cancelPreview } from "./bookings/[id]/cancel-preview";

export const metadata: Metadata = { title: "Dashboard" };

const LIST_LIMIT = 30;

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Overview" />
          <Skeleton className="h-64" />
        </>
      }
    >
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const query = await searchParams;
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin");
  const tab = parseBookingTab(query.tab);
  const now = new Date();

  return user.role === "TRAINER" ? (
    <TrainerOverview user={user} tab={tab} now={now} />
  ) : (
    <ClientOverview user={user} tab={tab} now={now} />
  );
}

const bookingInclude = {
  client: { select: { name: true } },
  trainer: {
    select: {
      id: true,
      timezone: true,
      cancellationWindowHours: true,
      lateCancelFeePercent: true,
      user: { select: { name: true, avatarFileId: true } },
    },
  },
} satisfies Prisma.BookingInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** The active tab's bookings plus a count for every tab. */
async function loadTab(user: CurrentUser, tab: BookingTab, now: Date) {
  const mine = participantWhere(user);
  const [bookings, ...counts] = await Promise.all([
    db.booking.findMany({
      where: { AND: [mine, bookingTabWhere(tab, user.role, now)] },
      include: bookingInclude,
      orderBy: { startsAt: tab === "upcoming" ? "asc" : "desc" },
      take: LIST_LIMIT,
    }),
    ...BOOKING_TABS.map((t) => db.booking.count({ where: { AND: [mine, bookingTabWhere(t, user.role, now)] } })),
  ]);
  const countByTab = Object.fromEntries(BOOKING_TABS.map((t, i) => [t, counts[i] ?? 0])) as Record<BookingTab, number>;
  return { bookings, counts: countByTab };
}

// ---------------------------------------------------------------------------
// Trainer
// ---------------------------------------------------------------------------

async function TrainerOverview({ user, tab, now }: { user: CurrentUser; tab: BookingTab; now: Date }) {
  const profile = await db.trainerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, timezone: true, published: true, _count: { select: { availability: true } } },
  });
  if (!profile) redirect("/dashboard/profile");

  const week = resolveWeek(undefined, now, profile.timezone);
  const [next, thisWeek, list] = await Promise.all([
    db.booking.findMany({
      where: { trainerId: profile.id, status: "CONFIRMED", endsAt: { gt: now } },
      include: bookingInclude,
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    db.booking.findMany({
      where: {
        trainerId: profile.id,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        startsAt: { gte: week.start, lt: week.end },
      },
      select: { clientId: true, startsAt: true, endsAt: true },
    }),
    loadTab(user, tab, now),
  ]);

  const stillToCome = thisWeek.filter((b) => b.startsAt >= now).length;
  const bookedMinutes = thisWeek.reduce((sum, b) => sum + (b.endsAt.getTime() - b.startsAt.getTime()) / 60_000, 0);
  const bookedHours = Math.round((bookedMinutes / 60) * 10) / 10;

  return (
    <>
      <PageHeader title={`Hi, ${firstName(user.name)}`} description="Your sessions at a glance." />
      <div className="space-y-8">
        {(!profile.published || profile._count.availability === 0) && (
          <Card className="space-y-2 border-amber-300 bg-amber-50 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-medium">Finish setting up so clients can book you</p>
            <ul className="list-inside list-disc space-y-1">
              {!profile.published && (
                <li>
                  Your profile is hidden.{" "}
                  <Link href="/dashboard/profile" className="font-medium underline">
                    Publish it
                  </Link>
                </li>
              )}
              {profile._count.availability === 0 && (
                <li>
                  You haven&apos;t set any weekly hours.{" "}
                  <Link href="/dashboard/availability" className="font-medium underline">
                    Add availability
                  </Link>
                </li>
              )}
            </ul>
          </Card>
        )}

        <section aria-label="This week" className="grid grid-cols-3 gap-3">
          <Stat label="Sessions this week" value={thisWeek.length} />
          <Stat label="Still to come" value={stillToCome} />
          <Stat label="Hours booked" value={bookedHours} />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_240px] lg:items-start">
          <Card className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Next sessions</h2>
              <Link href="/dashboard/calendar" className="text-sm text-brand hover:underline">
                Calendar
              </Link>
            </div>
            {next.length === 0 ? (
              <p className="text-sm text-subtle">Nothing booked yet. New bookings will show up here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {next.map((b) => (
                  <NextSessionRow key={b.id} booking={b} now={now} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">Quick links</h2>
            <ul className="space-y-1 text-sm">
              {[
                ["/dashboard/calendar", "Week calendar"],
                ["/dashboard/availability", "Weekly hours"],
                ["/dashboard/calendar#time-off", "Add time off"],
                ["/dashboard/profile", "Edit profile"],
                ["/dashboard/messages", "Messages"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href!} className="block rounded-md px-2 py-1.5 hover:bg-muted">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <BookingTabs
          user={user}
          tab={tab}
          now={now}
          {...list}
          empty={{
            upcoming: "No upcoming sessions. Make sure your profile is published and your weekly hours are set.",
            past: "No past sessions yet.",
            cancelled: "No cancelled sessions.",
          }}
        />
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-subtle sm:text-sm">{label}</p>
    </Card>
  );
}

function NextSessionRow({ booking: b, now }: { booking: BookingRow; now: Date }) {
  const join = joinUrl(b, now);
  const phase = sessionPhase(b, now);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <Link href={`/dashboard/bookings/${b.id}`} className="font-medium hover:underline">
          {formatSlot(b.startsAt, b.trainer.timezone)}
        </Link>
        <p className="flex flex-wrap items-center gap-2 text-sm text-subtle">
          {b.client.name} · {formatLabels[b.format]}
          {phase === "in-progress" && <Badge className="bg-brand text-white">Now</Badge>}
          {phase === "starting-soon" && <Badge className="bg-brand/15 text-brand">Starting soon</Badge>}
        </p>
      </div>
      {join && <JoinCallLink href={join} size="sm" />}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

async function ClientOverview({ user, tab, now }: { user: CurrentUser; tab: BookingTab; now: Date }) {
  const [next, list] = await Promise.all([
    db.booking.findFirst({
      where: { clientId: user.id, ...bookingTabWhere("upcoming", user.role, now) },
      include: bookingInclude,
      orderBy: { startsAt: "asc" },
    }),
    loadTab(user, tab, now),
  ]);

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName(user.name)}`}
        description="Your sessions at a glance."
        action={<LinkButton href="/trainers">Find a trainer</LinkButton>}
      />
      <div className="space-y-8">
        {next ? (
          <NextSessionCard booking={next} now={now} />
        ) : (
          <Card className="space-y-3 text-center">
            <h2 className="font-semibold">No sessions booked</h2>
            <p className="text-sm text-subtle">Find a trainer you like and pick a time that suits you.</p>
            <LinkButton href="/trainers" variant="primary">
              Browse trainers
            </LinkButton>
          </Card>
        )}

        <BookingTabs
          user={user}
          tab={tab}
          now={now}
          {...list}
          empty={{
            upcoming: (
              <>
                No upcoming sessions.{" "}
                <Link href="/trainers" className="font-medium text-brand">
                  Find a trainer
                </Link>
              </>
            ),
            past: "No past sessions yet.",
            cancelled: "No cancelled sessions.",
          }}
        />
      </div>
    </>
  );
}

function NextSessionCard({ booking: b, now }: { booking: BookingRow; now: Date }) {
  const join = joinUrl(b, now);
  const phase = sessionPhase(b, now);
  return (
    <Card className="border-brand/40">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-brand">
        {phase === "in-progress" ? "Happening now" : phase === "starting-soon" ? "Starting soon" : "Next session"}
      </p>
      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={b.trainer.user.name} fileId={b.trainer.user.avatarFileId} size={56} />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-lg font-semibold">
            <Link href={`/dashboard/bookings/${b.id}`} className="hover:underline">
              {formatSlotRange(b.startsAt, b.endsAt, b.trainer.timezone)}
            </Link>
          </h2>
          <LocalTime start={b.startsAt} end={b.endsAt} timezone={b.trainer.timezone} className="block text-sm text-subtle" />
          <p className="text-sm">
            with {b.trainer.user.name} · {formatLabels[b.format]}
            {b.format === "IN_PERSON" && b.location && <> · {b.location}</>}
          </p>
          {b.status === "PENDING_PAYMENT" && <BookingStatusBadge status={b.status} />}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {join && <JoinCallLink href={join} />}
        <LinkButton href={`/dashboard/bookings/${b.id}`}>View details</LinkButton>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared booking list with Upcoming / Past / Cancelled tabs
// ---------------------------------------------------------------------------

const tabLabels: Record<BookingTab, string> = { upcoming: "Upcoming", past: "Past", cancelled: "Cancelled" };

function BookingTabs({
  user,
  tab,
  now,
  bookings,
  counts,
  empty,
}: {
  user: CurrentUser;
  tab: BookingTab;
  now: Date;
  bookings: BookingRow[];
  counts: Record<BookingTab, number>;
  empty: Record<BookingTab, ReactNode>;
}) {
  return (
    <section aria-labelledby="sessions-heading">
      <h2 id="sessions-heading" className="mb-2 font-semibold">
        Sessions
      </h2>
      <nav aria-label="Filter sessions" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {BOOKING_TABS.map((t) => (
          <Link
            key={t}
            href={t === "upcoming" ? "/dashboard" : `/dashboard?tab=${t}`}
            scroll={false}
            aria-current={tab === t ? "page" : undefined}
            className={cx(
              "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              tab === t ? "border-brand font-medium" : "border-transparent text-subtle hover:text-foreground",
            )}
          >
            {tabLabels[t]}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{counts[t]}</span>
          </Link>
        ))}
      </nav>

      {bookings.length === 0 ? (
        <p className="text-sm text-subtle">{empty[tab]}</p>
      ) : (
        <>
          <ul className="space-y-3">
            {bookings.map((b) => (
              <BookingItem key={b.id} booking={b} user={user} now={now} />
            ))}
          </ul>
          {counts[tab] > bookings.length && (
            <p className="mt-3 text-xs text-subtle">
              Showing the {tab === "upcoming" ? "next" : "latest"} {bookings.length} of {counts[tab]} sessions.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function BookingItem({ booking: b, user, now }: { booking: BookingRow; user: CurrentUser; now: Date }) {
  const isTrainer = user.role === "TRAINER";
  const otherName = isTrainer ? b.client.name : b.trainer.user.name;
  const join = joinUrl(b, now);
  const canCancel = (b.status === "PENDING_PAYMENT" || b.status === "CONFIRMED") && b.startsAt > now;
  const canComplete = isTrainer && b.status === "CONFIRMED" && b.startsAt < now;

  return (
    <li>
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/dashboard/bookings/${b.id}`} className="font-medium hover:underline">
                {formatSlot(b.startsAt, b.trainer.timezone)}
              </Link>
              <BookingStatusBadge status={b.status} />
            </div>
            {!isTrainer && (
              <LocalTime start={b.startsAt} timezone={b.trainer.timezone} className="block text-xs text-subtle" />
            )}
            <p className="text-sm text-subtle">
              {isTrainer ? (
                otherName
              ) : (
                <Link href={`/trainers/${b.trainer.id}`} className="hover:underline">
                  with {otherName}
                </Link>
              )}{" "}
              · {formatLabels[b.format]} · {formatMoney(b.priceCents, b.currency)}
              {b.packagePurchaseId && " (package)"}
            </p>
            {b.notes && <p className="text-sm">“{b.notes}”</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {join && <JoinCallLink href={join} size="sm" />}
            <BookingReviewAction booking={b} viewer={user} />
            {canComplete && (
              <form action={completeBooking.bind(null, b.id)}>
                <SubmitButton variant="secondary" pendingText="Saving…">
                  Mark completed
                </SubmitButton>
              </form>
            )}
          </div>
        </div>

        {canCancel && (
          <details className="rounded-lg border border-line">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300">
              Cancel session…
            </summary>
            <div className="border-t border-line p-3">
              <CancelBookingForm
                bookingId={b.id}
                otherName={firstName(otherName)}
                preview={cancelPreview({
                  viewer: isTrainer ? "TRAINER" : "CLIENT",
                  status: b.status as "PENDING_PAYMENT" | "CONFIRMED",
                  startsAt: b.startsAt,
                  now,
                  windowHours: b.trainer.cancellationWindowHours,
                  lateFeePercent: b.trainer.lateCancelFeePercent,
                  priceCents: b.priceCents,
                  refundedCents: b.refundedCents,
                  currency: b.currency,
                  paidWithPackage: Boolean(b.packagePurchaseId),
                  clientName: firstName(b.client.name),
                })}
              />
            </div>
          </details>
        )}
      </Card>
    </li>
  );
}
