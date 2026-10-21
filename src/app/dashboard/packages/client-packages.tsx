import Link from "next/link";
import { Alert, Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { purchaseState, type PurchaseState } from "@/lib/package-pricing";
import { expirePurchases } from "@/lib/packages";
import { formatSlot } from "@/lib/scheduling";
import { formatDay, plural, PurchaseBadge } from "./purchase-status";

/** Packages that expire within this many days get a nudge. */
const EXPIRES_SOON_DAYS = 14;

const linkButton =
  "inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark";

async function loadPurchases(clientId: string, now: Date) {
  const purchases = await db.packagePurchase.findMany({
    where: { clientId },
    include: {
      package: { select: { title: true } },
      trainer: { select: { id: true, timezone: true, user: { select: { name: true } } } },
      bookings: {
        where: { status: "CONFIRMED", endsAt: { gt: now } },
        select: { id: true, startsAt: true },
        orderBy: { startsAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return purchases.map((p) => ({ ...p, state: purchaseState(p, now) }));
}

type Purchase = Awaited<ReturnType<typeof loadPurchases>>[number];

const historyStates: PurchaseState[] = ["used-up", "expired", "cancelled"];

export async function ClientPackages({ clientId, purchasedId }: { clientId: string; purchasedId?: string }) {
  const now = new Date();
  await expirePurchases(now, { clientId });
  // Checkouts abandoned long ago are not shown at all.
  const purchases = (await loadPurchases(clientId, now)).filter((p) => p.state !== "abandoned");

  const active = purchases.filter((p) => p.state === "usable");
  const pending = purchases.filter((p) => p.state === "awaiting-payment");
  const history = purchases.filter((p) => historyStates.includes(p.state));
  const justBought = purchasedId ? purchases.find((p) => p.id === purchasedId) : undefined;

  return (
    <>
      <PageHeader title="My packages" description="Sessions you've paid for in advance." />
      <div className="space-y-8">
        {justBought?.state === "usable" && (
          <Alert tone="success">
            {justBought.package.title} with {justBought.trainer.user.name} is ready. Book your first session
            whenever you like.
          </Alert>
        )}
        {justBought?.state === "awaiting-payment" && (
          <Alert tone="success">Thanks! We&apos;re confirming your payment. Your package will be ready shortly.</Alert>
        )}

        {purchases.length === 0 ? (
          <Card className="space-y-3 text-sm">
            <p>You haven&apos;t bought any packages yet.</p>
            <p className="text-subtle">
              A package is a set of sessions with one trainer, paid up front and usually cheaper per session. Look
              for them on a trainer&apos;s profile.
            </p>
            <Link href="/trainers" className={linkButton}>
              Find a trainer
            </Link>
          </Card>
        ) : (
          <>
            <section aria-labelledby="active-packages">
              <h2 id="active-packages" className="mb-3 font-semibold">
                Active
              </h2>
              {pending.length > 0 && (
                <ul className="mb-4 space-y-2">
                  {pending.map((p) => (
                    <li key={p.id}>
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        We&apos;re waiting for your payment for {p.package.title} with {p.trainer.user.name}. It
                        can be used as soon as the payment goes through.
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {active.length === 0 ? (
                <p className="text-sm text-subtle">
                  No active packages right now.{" "}
                  <Link href="/trainers" className="font-medium text-brand">
                    Find a trainer
                  </Link>
                </p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {active.map((p) => (
                    <li key={p.id}>
                      <ActiveCard purchase={p} now={now} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="package-history">
              <h2 id="package-history" className="mb-3 font-semibold">
                History
              </h2>
              {history.length === 0 ? (
                <p className="text-sm text-subtle">Used up, expired and cancelled packages will show up here.</p>
              ) : (
                <ul className="space-y-3">
                  {history.map((p) => (
                    <li key={p.id}>
                      <HistoryRow purchase={p} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function ActiveCard({ purchase: p, now }: { purchase: Purchase; now: Date }) {
  const remaining = p.sessionsTotal - p.sessionsUsed;
  const daysLeft = Math.ceil((p.expiresAt.getTime() - now.getTime()) / 86_400_000);
  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{p.package.title}</h3>
          <p className="text-sm text-subtle">
            with{" "}
            <Link href={`/trainers/${p.trainer.id}`} className="hover:underline">
              {p.trainer.user.name}
            </Link>
          </p>
        </div>
        <PurchaseBadge state={p.state} />
      </div>

      <div className="space-y-2">
        <p className="text-sm">
          <span className="text-2xl font-semibold">{remaining}</span> of {p.sessionsTotal} sessions left
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${(remaining / p.sessionsTotal) * 100}%` }} />
        </div>
        <p className={daysLeft <= EXPIRES_SOON_DAYS ? "text-sm font-medium text-amber-700 dark:text-amber-300" : "text-sm text-subtle"}>
          Use by {formatDay(p.expiresAt, p.trainer.timezone)}
          {daysLeft <= EXPIRES_SOON_DAYS && ` (${plural(daysLeft, "day")} left)`}
        </p>
      </div>

      {p.bookings.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-subtle">Booked with this package</p>
          <ul className="space-y-1 text-sm">
            {p.bookings.map((b) => (
              <li key={b.id}>
                <Link href={`/dashboard/bookings/${b.id}`} className="hover:underline">
                  {formatSlot(b.startsAt, p.trainer.timezone)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href={`/trainers/${p.trainer.id}`} className={`${linkButton} mt-auto`}>
        Book a session
      </Link>
    </Card>
  );
}

function HistoryRow({ purchase: p }: { purchase: Purchase }) {
  const tz = p.trainer.timezone;
  return (
    <Card className="flex flex-wrap items-start justify-between gap-3 py-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium break-words">{p.package.title}</h3>
          <PurchaseBadge state={p.state} />
        </div>
        <p className="text-sm text-subtle">
          with{" "}
          <Link href={`/trainers/${p.trainer.id}`} className="hover:underline">
            {p.trainer.user.name}
          </Link>{" "}
          · used {p.sessionsUsed} of {p.sessionsTotal} sessions
        </p>
        {p.bookings.length > 0 && (
          <p className="text-sm">
            {plural(p.bookings.length, "session")} still booked ahead.{" "}
            <Link href={`/dashboard/bookings/${p.bookings[0]!.id}`} className="font-medium text-brand">
              Next: {formatSlot(p.bookings[0]!.startsAt, tz)}
            </Link>
          </p>
        )}
      </div>
      <div className="text-sm text-subtle sm:text-right">
        <p>
          {formatMoney(p.priceCents, p.currency)} · bought {formatDay(p.createdAt, tz)}
        </p>
        {p.state === "expired" && <p>Expired {formatDay(p.expiresAt, tz)}</p>}
        {p.refundedCents > 0 && <p>Refunded {formatMoney(p.refundedCents, p.currency)}</p>}
      </div>
    </Card>
  );
}
