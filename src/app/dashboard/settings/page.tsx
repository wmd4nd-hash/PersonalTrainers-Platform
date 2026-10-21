import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/stripe";
import { CalendarFeed } from "./calendar-feed";
import { EmailPreferencesForm } from "./email-preferences-form";
import { NameForm } from "./name-form";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your account, email notifications and calendar sync." />
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const { id } = await requireUser();
  const user = await db.user.findUniqueOrThrow({
    where: { id },
    select: { name: true, email: true, role: true, emailNotifications: true, calendarToken: true },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Account</h2>
          <p className="text-sm text-subtle">
            You log in as <span className="font-medium text-foreground">{user.email}</span>.
          </p>
        </div>
        <NameForm name={user.name} />
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Email notifications</h2>
          <p className="text-sm text-subtle">
            {user.role === "TRAINER"
              ? "Bookings, cancellations, reminders, messages, reviews and verification updates."
              : user.role === "CLIENT"
                ? "Booking confirmations, cancellations and refunds, reminders, packages and messages."
                : "Platform alerts, like refunds that need attention."}{" "}
            You&apos;ll always see them in the app too.
          </p>
        </div>
        <EmailPreferencesForm enabled={user.emailNotifications} />
      </Card>

      {user.role !== "ADMIN" && (
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold">Calendar sync</h2>
            <p className="text-sm text-subtle">
              Subscribe to this link in Google Calendar, Apple Calendar or Outlook to see your
              {user.role === "TRAINER" ? " sessions with clients" : " training sessions"} next to everything else.
              New bookings and cancellations show up when your calendar app refreshes, usually within a few hours.
            </p>
          </div>
          <CalendarFeed url={appUrl(`/api/calendar/${user.calendarToken}`)} />
        </Card>
      )}

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Password</h2>
          <p className="text-sm text-subtle">Use at least 8 characters. We&apos;ll email you when it changes.</p>
        </div>
        <PasswordForm />
      </Card>
    </div>
  );
}
