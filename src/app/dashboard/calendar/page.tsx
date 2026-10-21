import { subMinutes } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { bookingStatusLabels, bookingStatusStyles } from "@/components/scheduling/booking-status";
import { LinkButton } from "@/components/scheduling/link-button";
import { Badge, Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatDateKey,
  formatDuration,
  minuteOfDay,
  PAYMENT_HOLD_MINUTES,
  resolveWeek,
  type Week,
} from "@/lib/scheduling";
import { TimeOffManager } from "./time-off";
import {
  blockPosition,
  buildWeek,
  describeSpan,
  formatHour,
  formatMinute,
  HOUR_PX,
  visibleRange,
  type CalendarDay,
} from "./week";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage({ searchParams }: PageProps<"/dashboard/calendar">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Calendar" />
          <Skeleton className="h-[480px]" />
        </>
      }
    >
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

type CalendarBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: "PENDING_PAYMENT" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  format: "IN_PERSON" | "ONLINE";
  client: { name: string };
};
type CalendarTimeOff = { id: string; startsAt: Date; endsAt: Date; reason: string };
type Day = CalendarDay<CalendarBooking, CalendarTimeOff>;

async function Calendar({ searchParams }: Pick<PageProps<"/dashboard/calendar">, "searchParams">) {
  const { week: weekParam } = await searchParams;
  const trainerId = await requireTrainerProfileId();
  const now = new Date();

  const trainer = await db.trainerProfile.findUniqueOrThrow({
    where: { id: trainerId },
    select: { timezone: true, availability: true },
  });
  const { timezone } = trainer;
  const week = resolveWeek(typeof weekParam === "string" ? weekParam : undefined, now, timezone);
  const inWeek = { startsAt: { lt: week.end }, endsAt: { gt: week.start } };

  const [bookings, timeOff, cancelled] = await Promise.all([
    db.booking.findMany({
      where: {
        trainerId,
        ...inWeek,
        OR: [
          { status: { in: ["CONFIRMED", "COMPLETED"] } },
          // Unpaid bookings hold their slot only while checkout is open.
          { status: "PENDING_PAYMENT", createdAt: { gt: subMinutes(now, PAYMENT_HOLD_MINUTES) } },
        ],
      },
      select: { id: true, startsAt: true, endsAt: true, status: true, format: true, client: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
    }),
    db.timeOff.findMany({
      where: { trainerId, ...inWeek },
      select: { id: true, startsAt: true, endsAt: true, reason: true },
      orderBy: { startsAt: "asc" },
    }),
    db.booking.count({ where: { trainerId, status: "CANCELLED", startsAt: { gte: week.start, lt: week.end } } }),
  ]);

  const days = buildWeek({ days: week.days, timezone, windows: trainer.availability, bookings, timeOff, now });
  const bookedMinutes = bookings.reduce((sum, b) => sum + (b.endsAt.getTime() - b.startsAt.getTime()) / 60_000, 0);
  const isCurrentWeek = days.some((d) => d.isToday);

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`Your week in ${timezone}. Shaded times are open for booking.`}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/dashboard/availability">Weekly hours</LinkButton>
            <LinkButton href="#time-off">Add time off</LinkButton>
          </div>
        }
      />

      <div className="space-y-4">
        <WeekNav week={week} isCurrentWeek={isCurrentWeek} />

        <p className="text-sm text-subtle">
          {bookings.length === 0
            ? "No sessions this week."
            : `${bookings.length} session${bookings.length === 1 ? "" : "s"} · ${formatDuration(bookedMinutes)} booked`}
          {cancelled > 0 && ` · ${cancelled} cancelled`}
        </p>

        <Legend />
        <WeekGrid days={days} now={now} timezone={timezone} />
        <DayList days={days} timezone={timezone} />

        <div className="pt-4">
          <TimeOffManager trainerId={trainerId} timezone={timezone} now={now} />
        </div>
      </div>
    </>
  );
}

function WeekNav({ week, isCurrentWeek }: { week: Week; isCurrentWeek: boolean }) {
  const first = formatDateKey(week.days[0]!, { month: "short", day: "numeric" });
  const last = formatDateKey(week.days[6]!, { month: "short", day: "numeric", year: "numeric" });
  return (
    <nav aria-label="Choose a week" className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold" aria-live="polite">
        {first} – {last}
      </h2>
      <div className="flex gap-2">
        <LinkButton href={`/dashboard/calendar?week=${week.previousKey}`} className="px-3">
          <span aria-hidden>←</span>
          <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
        </LinkButton>
        <LinkButton href="/dashboard/calendar" aria-current={isCurrentWeek ? "date" : undefined}>
          This week
        </LinkButton>
        <LinkButton href={`/dashboard/calendar?week=${week.nextKey}`} className="px-3">
          <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
          <span aria-hidden>→</span>
        </LinkButton>
      </div>
    </nav>
  );
}

// Session blocks use the same colours as the status badges.
const blockStyles = bookingStatusStyles;

const timeOffPattern =
  "bg-[repeating-linear-gradient(135deg,var(--muted)_0,var(--muted)_6px,transparent_6px,transparent_12px)]";

function Legend() {
  const swatch = "inline-block size-3 rounded-sm border border-line";
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span className={cx(swatch, "bg-brand/10")} /> Open for booking
      </li>
      <li className="flex items-center gap-1.5">
        <span className={cx(swatch, blockStyles.CONFIRMED)} /> Confirmed
      </li>
      <li className="flex items-center gap-1.5">
        <span className={cx(swatch, blockStyles.PENDING_PAYMENT)} /> Awaiting payment
      </li>
      <li className="flex items-center gap-1.5">
        <span className={cx(swatch, blockStyles.COMPLETED)} /> Completed
      </li>
      <li className="flex items-center gap-1.5">
        <span className={cx(swatch, timeOffPattern)} /> Time off
      </li>
    </ul>
  );
}

function sessionTimes(b: { startsAt: Date; endsAt: Date }, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).formatRange(
    b.startsAt,
    b.endsAt,
  );
}

/** Desktop: Monday to Sunday side by side, hours down the side. */
function WeekGrid({ days, now, timezone }: { days: Day[]; now: Date; timezone: string }) {
  const range = visibleRange(days);
  const height = ((range.endMinute - range.startMinute) / 60) * HOUR_PX;
  const hours: number[] = [];
  for (let m = range.startMinute; m < range.endMinute; m += 60) hours.push(m);
  const nowMinute = minuteOfDay(now, timezone);
  const columns = "grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";

  return (
    <div className="hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
      <div className={cx(columns, "border-b border-line")}>
        <div />
        {days.map((day) => (
          <div
            key={day.key}
            className={cx("border-l border-line px-1 py-2 text-center", day.isToday && "text-brand")}
          >
            <div className="text-xs">{formatDateKey(day.key, { weekday: "short" })}</div>
            <div className="text-lg font-semibold leading-tight">{formatDateKey(day.key, { day: "numeric" })}</div>
            {day.isToday && <span className="sr-only">Today</span>}
          </div>
        ))}
      </div>

      <div className={cx(columns, "py-2")}>
        <div className="relative" style={{ height }} aria-hidden>
          {hours.map((m) => (
            <span
              key={m}
              className="absolute right-2 -translate-y-1/2 text-[11px] text-subtle"
              style={{ top: ((m - range.startMinute) / 60) * HOUR_PX }}
            >
              {formatHour(m)}
            </span>
          ))}
        </div>

        {days.map((day) => (
          <div
            key={day.key}
            className={cx("relative border-l border-line", day.isToday && "bg-brand/[0.03]")}
            style={{
              height,
              backgroundImage: "linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
              backgroundSize: `100% ${HOUR_PX}px`,
            }}
          >
            {day.open.map((open) => {
              const pos = blockPosition(open, range);
              return pos && <div key={open.startMinute} aria-hidden className="absolute inset-x-0 bg-brand/10" style={pos} />;
            })}

            {day.timeOff.map((t) => {
              const pos = blockPosition(t, range);
              return (
                pos && (
                  <div
                    key={t.id}
                    className={cx(
                      "absolute inset-x-0.5 overflow-hidden rounded-md border border-dashed border-line px-1.5 py-1 text-[11px] leading-tight text-subtle",
                      timeOffPattern,
                    )}
                    style={pos}
                  >
                    <span className="block font-medium">Time off</span>
                    {t.reason && <span className="block truncate">{t.reason}</span>}
                  </div>
                )
              );
            })}

            {day.bookings.map((b) => {
              const pos = blockPosition(b, range);
              if (!pos) return null;
              return (
                <Link
                  key={b.id}
                  href={`/dashboard/bookings/${b.id}`}
                  className={cx(
                    "absolute overflow-hidden rounded-md border border-black/10 px-1.5 py-1 text-[11px] leading-tight shadow-sm hover:z-10 hover:ring-2 hover:ring-brand focus-visible:z-10 dark:border-white/10",
                    blockStyles[b.status],
                  )}
                  style={{
                    top: pos.top + 1,
                    height: Math.max(pos.height - 2, 18),
                    left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / b.lanes}% - 4px)`,
                  }}
                >
                  <span className="block truncate font-medium">{b.client.name}</span>
                  <span className="block truncate">
                    {sessionTimes(b, timezone)}
                    {b.format === "ONLINE" && " · Online"}
                  </span>
                  <span className="sr-only">, {bookingStatusLabels[b.status]}</span>
                </Link>
              );
            })}

            {day.isToday && nowMinute >= range.startMinute && nowMinute < range.endMinute && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                style={{ top: ((nowMinute - range.startMinute) / 60) * HOUR_PX }}
              >
                <span className="absolute -top-[5px] -left-1 size-2 rounded-full bg-red-500" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Phones: one card per day. */
function DayList({ days, timezone }: { days: Day[]; timezone: string }) {
  return (
    <ol className="space-y-3 md:hidden">
      {days.map((day) => (
        <li key={day.key}>
          <Card className={cx("space-y-2 p-4", day.isToday && "border-brand")}>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {formatDateKey(day.key, { weekday: "long", month: "short", day: "numeric" })}
              {day.isToday && <Badge className="bg-brand text-white">Today</Badge>}
            </h3>
            <p className="text-xs text-subtle">
              {day.open.length > 0
                ? `Open ${day.open.map((o) => `${formatMinute(o.startMinute)} – ${formatMinute(o.endMinute)}`).join(", ")}`
                : "Not open for booking"}
            </p>
            {day.timeOff.map((t) => (
              <p key={t.id} className={cx("rounded-md border border-dashed border-line px-2 py-1 text-xs", timeOffPattern)}>
                <span className="font-medium">Time off</span> · {describeSpan(t)}
                {t.reason && ` · ${t.reason}`}
              </p>
            ))}
            {day.bookings.length > 0 ? (
              <ul className="space-y-2">
                {day.bookings.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/dashboard/bookings/${b.id}`}
                      className={cx("flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm", blockStyles[b.status])}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{sessionTimes(b, timezone)}</span>
                        <span className="block truncate text-xs">
                          {b.client.name}
                          {b.format === "ONLINE" && " · Online"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs">{bookingStatusLabels[b.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              day.open.length > 0 && <p className="text-xs text-subtle">No sessions booked.</p>
            )}
          </Card>
        </li>
      ))}
    </ol>
  );
}
