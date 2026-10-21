import Link from "next/link";
import { deactivatePackage, reactivatePackage } from "@/app/actions/packages";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import { perSessionCents } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import {
  fullPriceCents,
  purchaseState,
  savingsPercent,
  unusedRefundCents,
  unusedSessions,
} from "@/lib/package-pricing";
import { expirePurchases } from "@/lib/packages";
import { PackageForm } from "./package-form";
import { formatDay, plural, PurchaseBadge } from "./purchase-status";
import { RefundButton } from "./refund-button";

/** How many purchases the table shows, newest first. */
const PURCHASE_LIMIT = 200;

export async function TrainerPackages() {
  const trainerId = await requireTrainerProfileId();
  const now = new Date();
  await expirePurchases(now, { trainerId });

  const [trainer, packages, purchases] = await Promise.all([
    db.trainerProfile.findUniqueOrThrow({
      where: { id: trainerId },
      select: { sessionRateCents: true, currency: true, timezone: true, published: true },
    }),
    db.package.findMany({
      where: { trainerId },
      include: { _count: { select: { purchases: { where: { status: { not: "PENDING_PAYMENT" } } } } } },
      orderBy: [{ active: "desc" }, { sessionCount: "asc" }, { createdAt: "asc" }],
    }),
    db.packagePurchase.findMany({
      // Unpaid checkouts aren't sales yet.
      where: { trainerId, status: { not: "PENDING_PAYMENT" } },
      include: {
        client: { select: { name: true, email: true } },
        package: { select: { title: true } },
        bookings: {
          where: { status: { in: ["PENDING_PAYMENT", "CONFIRMED"] }, endsAt: { gt: now } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: PURCHASE_LIMIT,
    }),
  ]);
  const { sessionRateCents, currency, timezone } = trainer;

  return (
    <>
      <PageHeader
        title="Packages"
        description="Sell several sessions up front at a lower price per session. Clients buy them from your profile."
      />
      <div className="space-y-8">
        {!trainer.published && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Your profile isn&apos;t published, so clients can&apos;t see your packages yet.{" "}
            <Link href="/dashboard/profile" className="font-medium underline">
              Publish your profile
            </Link>
          </p>
        )}

        <section aria-labelledby="your-packages">
          <h2 id="your-packages" className="mb-3 font-semibold">
            Your packages
          </h2>
          {packages.length === 0 ? (
            <p className="text-sm text-subtle">
              No packages yet. A 5 or 10 session pack at a small discount is a good place to start.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {packages.map((p) => {
                const saving = savingsPercent(p.priceCents, p.sessionCount, sessionRateCents);
                const savedCents = fullPriceCents(p.sessionCount, sessionRateCents) - p.priceCents;
                return (
                  <li key={p.id}>
                    <Card className="flex h-full flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold break-words">{p.title}</h3>
                          <p className="text-sm text-subtle">
                            {plural(p.sessionCount, "session")} · valid for {plural(p.validDays, "day")}
                          </p>
                        </div>
                        <Badge
                          className={
                            p.active
                              ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
                              : "bg-muted text-subtle"
                          }
                        >
                          {p.active ? "On sale" : "Inactive"}
                        </Badge>
                      </div>
                      {p.description && <p className="text-sm whitespace-pre-line break-words">{p.description}</p>}
                      <dl className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <dt className="text-xs text-subtle">Price</dt>
                          <dd className="font-medium">{formatMoney(p.priceCents, currency)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-subtle">Per session</dt>
                          <dd className="font-medium">{formatMoney(perSessionCents(p.priceCents, p.sessionCount), currency)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-subtle">Saving</dt>
                          <dd className="font-medium">
                            {savedCents > 0
                              ? saving > 0
                                ? `${saving}% (${formatMoney(savedCents, currency)})`
                                : formatMoney(savedCents, currency)
                              : savedCents === 0
                                ? "None"
                                : `Costs ${formatMoney(-savedCents, currency)} more`}
                          </dd>
                        </div>
                      </dl>
                      <p className="text-xs text-subtle">
                        {p._count.purchases === 0 ? "Not sold yet" : `Sold ${plural(p._count.purchases, "time")}`}
                        {!p.active && " · Hidden from your profile. Clients who bought it can still use it."}
                      </p>
                      <div className="mt-auto space-y-3">
                        <form action={(p.active ? deactivatePackage : reactivatePackage).bind(null, p.id)}>
                          <Button variant="secondary" className="px-3 py-1.5" aria-label={`${p.active ? "Deactivate" : "Reactivate"} ${p.title}`}>
                            {p.active ? "Deactivate" : "Reactivate"}
                          </Button>
                        </form>
                        <details className="group rounded-lg border border-line px-3 py-2">
                          <summary className="cursor-pointer text-sm font-medium">Edit package</summary>
                          <div className="mt-3">
                            <PackageForm
                              packageId={p.id}
                              initial={{
                                title: p.title,
                                description: p.description,
                                sessionCount: String(p.sessionCount),
                                price: (p.priceCents / 100).toFixed(2),
                                validDays: String(p.validDays),
                              }}
                              singleRateCents={sessionRateCents}
                              currency={currency}
                            />
                            <p className="mt-3 text-xs text-subtle">
                              Changes apply to new purchases. Clients who already bought keep what they paid for.
                            </p>
                          </div>
                        </details>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Card>
          <h2 className="mb-4 font-semibold">New package</h2>
          <PackageForm singleRateCents={sessionRateCents} currency={currency} />
        </Card>

        <section aria-labelledby="package-purchases">
          <h2 id="package-purchases" className="mb-3 font-semibold">
            Purchases
          </h2>
          {purchases.length === 0 ? (
            <p className="text-sm text-subtle">No one has bought a package yet. Sales will show up here.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-line text-left text-xs text-subtle">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Client</th>
                    <th scope="col" className="px-4 py-2 font-medium">Package</th>
                    <th scope="col" className="px-4 py-2 font-medium">Sessions used</th>
                    <th scope="col" className="px-4 py-2 font-medium">Expires</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {purchases.map((p) => {
                    const state = purchaseState(p, now);
                    const refundCents = unusedRefundCents(p);
                    const unused = unusedSessions(p);
                    const upcoming = p.bookings.length;
                    const refundable = (p.status === "ACTIVE" || p.status === "EXPIRED") && refundCents > 0;
                    return (
                      <tr key={p.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.client.name}</p>
                          <p className="text-xs break-all text-subtle">{p.client.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{p.package.title}</p>
                          <p className="text-xs text-subtle">{formatMoney(p.priceCents, p.currency)}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {p.sessionsUsed} / {p.sessionsTotal}
                          {upcoming > 0 && <p className="text-xs text-subtle">{upcoming} booked ahead</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDay(p.expiresAt, timezone)}</td>
                        <td className="px-4 py-3">
                          <PurchaseBadge state={state} />
                          {p.refundedCents > 0 && (
                            <p className="mt-1 text-xs text-subtle">
                              Refunded {formatMoney(p.refundedCents, p.currency)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {refundable &&
                            (upcoming > 0 ? (
                              <p className="max-w-48 text-left text-xs text-subtle">
                                Cancel the booked {upcoming === 1 ? "session" : "sessions"} to refund the rest.
                              </p>
                            ) : (
                              <RefundButton
                                purchaseId={p.id}
                                clientName={p.client.name}
                                summary={`${formatMoney(refundCents, p.currency)} for ${plural(unused, "unused session")}`}
                              />
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {purchases.length === PURCHASE_LIMIT && (
            <p className="mt-2 text-xs text-subtle">Showing your {PURCHASE_LIMIT} most recent purchases.</p>
          )}
        </section>
      </div>
    </>
  );
}
