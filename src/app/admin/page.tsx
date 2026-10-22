import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui";
import { getAdminOverview, type MoneyTotal } from "@/lib/admin-stats";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatSlot } from "@/lib/scheduling";
import { expireLapsedVerifications, formatDay } from "@/lib/verification";
import { bookingStatusLabels, bookingStatusStyles } from "./bookings/booking-list";
import { RoleBadge, SuspendedBadge } from "./users/role-badge";

export const metadata: Metadata = { title: "Admin" };

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="How the platform is doing." />
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

function Kpi({ label, children, hint, href }: { label: string; children: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <div className="h-full space-y-1 rounded-xl border border-line bg-surface p-4 transition-colors">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</p>
      <div className="break-words text-xl font-semibold tabular-nums sm:text-2xl">{children}</div>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl hover:[&>div]:border-brand">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Amounts per currency, largest first. Currencies are never added together. */
function Money({ totals }: { totals: MoneyTotal[] }) {
  if (totals.length === 0) return <>—</>;
  const [main, ...rest] = totals;
  return (
    <>
      {formatMoney(main!.cents, main!.currency)}
      {rest.length > 0 && (
        <span className="mt-0.5 block text-sm font-normal text-subtle">
          + {rest.map((t) => formatMoney(t.cents, t.currency)).join(" · ")}
        </span>
      )}
    </>
  );
}

async function Overview() {
  await requireAdmin();
  // Take the badge from trainers whose documents have lapsed, without slowing the page down.
  after(() => expireLapsedVerifications(db));
  const { monthStart, counts, month, recentSignups, recentBookings } = await getAdminOverview();
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(monthStart);

  return (
    <div className="space-y-8">
      <section aria-labelledby="people">
        <h2 id="people" className="mb-3 font-semibold">
          People
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Clients"
            href="/admin/users?role=CLIENT"
            hint={counts.suspendedClients > 0 ? `${counts.suspendedClients} suspended` : undefined}
          >
            {counts.clients}
          </Kpi>
          <Kpi
            label="Trainers"
            href="/admin/users?role=TRAINER"
            hint={counts.suspendedTrainers > 0 ? `${counts.suspendedTrainers} suspended` : undefined}
          >
            {counts.trainers}
          </Kpi>
          <Kpi label="Published trainers" hint="Visible to clients">
            {counts.published}
          </Kpi>
          <Kpi
            label="Verified trainers"
            href="/admin/verification"
            hint={
              counts.pendingDocuments > 0
                ? `${counts.pendingDocuments} document${counts.pendingDocuments === 1 ? "" : "s"} to review`
                : "Nothing waiting for review"
            }
          >
            {counts.verified}
          </Kpi>
        </div>
      </section>

      <section aria-labelledby="month">
        <h2 id="month" className="mb-3 font-semibold">
          {monthName} so far <span className="text-sm font-normal text-subtle">(UTC)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Bookings" href="/admin/bookings" hint="Paid sessions and package sessions booked">
            {month.bookings}
          </Kpi>
          <Kpi label="Gross booking value" hint="Card-paid sessions and packages, before refunds">
            <Money totals={month.gross} />
          </Kpi>
          <Kpi label="Platform fees" hint="Our share of those payments, before refunds">
            <Money totals={month.fees} />
          </Kpi>
          <Kpi label="Refunds" hint="Given back to clients this month">
            <Money totals={month.refunds} />
          </Kpi>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="signups">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="signups" className="font-semibold">
              Recent sign-ups
            </h2>
            <Link href="/admin/users" className="text-sm font-medium text-brand">
              All users
            </Link>
          </div>
          {recentSignups.length === 0 ? (
            <Card className="text-sm text-subtle">No one has signed up yet.</Card>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {recentSignups.map((user) => (
                <Link
                  key={user.id}
                  href={`/admin/users/${user.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted"
                >
                  <Avatar name={user.name} fileId={user.avatarFileId} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-subtle">{user.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="flex gap-1">
                      {user.suspendedAt && <SuspendedBadge />}
                      <RoleBadge role={user.role} />
                    </span>
                    <span className="text-xs text-subtle">{formatDay(user.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="bookings">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="bookings" className="font-semibold">
              Recent bookings
            </h2>
            <Link href="/admin/bookings" className="text-sm font-medium text-brand">
              All bookings
            </Link>
          </div>
          {recentBookings.length === 0 ? (
            <Card className="text-sm text-subtle">No bookings yet.</Card>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {recentBookings.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="truncate">
                      <Link href={`/admin/users/${b.client.id}`} className="font-medium hover:underline">
                        {b.client.name}
                      </Link>
                      <span className="text-subtle"> with </span>
                      <Link href={`/admin/users/${b.trainer.user.id}`} className="font-medium hover:underline">
                        {b.trainer.user.name}
                      </Link>
                    </p>
                    <p className="text-xs text-subtle">{formatSlot(b.startsAt, b.trainer.timezone)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge className={bookingStatusStyles[b.status]}>{bookingStatusLabels[b.status]}</Badge>
                    <span className="text-xs text-subtle">
                      {b.packagePurchaseId ? "Package" : formatMoney(b.priceCents, b.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
