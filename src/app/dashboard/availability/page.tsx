import type { Metadata } from "next";
import { Suspense } from "react";
import { deleteAvailability } from "@/app/actions/trainer";
import { LinkButton } from "@/components/scheduling/link-button";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  DAY_NAMES,
  DISPLAY_WEEK,
  formatDuration,
  formatTimeOfDay,
  weeklyAvailabilityMinutes,
} from "@/lib/scheduling";
import { TimeOffManager } from "../calendar/time-off";
import { AddWindowForm } from "./add-window-form";
import { CopyDayForm } from "./copy-day-form";

export const metadata: Metadata = { title: "Availability" };

export default function AvailabilityPage() {
  return (
    <>
      <PageHeader
        title="Weekly availability"
        description="Clients can book sessions that fit inside these hours, up to four weeks ahead."
        action={<LinkButton href="/dashboard/calendar">Open calendar</LinkButton>}
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Availability />
      </Suspense>
    </>
  );
}

async function Availability() {
  const trainerId = await requireTrainerProfileId();
  const now = new Date();
  const profile = await db.trainerProfile.findUniqueOrThrow({
    where: { id: trainerId },
    select: {
      timezone: true,
      sessionMinutes: true,
      availability: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
    },
  });
  const windows = profile.availability;
  const total = weeklyAvailabilityMinutes(windows);

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Your week</h2>
          <p className="text-sm" aria-live="polite">
            {total === 0 ? (
              <span className="text-subtle">No hours set yet</span>
            ) : (
              <>
                <span className="font-semibold">{formatDuration(total)}</span>{" "}
                <span className="text-subtle">a week open for booking</span>
              </>
            )}
          </p>
        </div>
        <p className="text-sm text-subtle">
          Times are in your timezone ({profile.timezone}). Each session is {profile.sessionMinutes} minutes, so a
          window needs to be at least that long.
        </p>

        <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Weekly hours">
          {DISPLAY_WEEK.map((day) => {
            const dayWindows = windows.filter((w) => w.dayOfWeek === day);
            const dayTotal = weeklyAvailabilityMinutes(dayWindows);
            return (
              <li key={day} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <span className="w-24 shrink-0 text-sm font-medium">{DAY_NAMES[day]}</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  {dayWindows.length === 0 ? (
                    <span className="text-sm text-subtle">Closed</span>
                  ) : (
                    dayWindows.map((w) => {
                      const label = `${formatTimeOfDay(w.startMinute)}–${formatTimeOfDay(w.endMinute)}`;
                      return (
                        <span
                          key={w.id}
                          className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-0.5 pl-3 text-sm"
                        >
                          {label}
                          <form action={deleteAvailability.bind(null, w.id)}>
                            <button
                              type="submit"
                              aria-label={`Remove ${DAY_NAMES[day]} ${label}`}
                              title="Remove"
                              className="inline-flex size-6 items-center justify-center rounded-full text-subtle hover:bg-line hover:text-foreground"
                            >
                              <span aria-hidden>×</span>
                            </button>
                          </form>
                        </span>
                      );
                    })
                  )}
                </div>
                {dayTotal > 0 && <span className="text-xs text-subtle">{formatDuration(dayTotal)}</span>}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-semibold">Add hours</h2>
          <p className="mb-4 text-sm text-subtle">Add one window at a time. Windows on the same day can&apos;t overlap.</p>
          <AddWindowForm />
        </Card>
        <Card>
          <h2 className="mb-1 font-semibold">Same hours every weekday?</h2>
          <p className="mb-4 text-sm text-subtle">Set up one day, then copy it to the rest of the working week.</p>
          <CopyDayForm />
        </Card>
      </div>

      <TimeOffManager trainerId={trainerId} timezone={profile.timezone} now={now} />
    </div>
  );
}
