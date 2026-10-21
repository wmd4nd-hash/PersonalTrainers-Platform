import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  EARNINGS_PERIODS,
  entryTypeLabels,
  formatDate,
  inRange,
  periodRange,
  summarize,
  type EarningsPeriod,
  type LedgerEntry,
  type Totals,
} from "@/lib/earnings";
import { feePolicy } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import { loadTrainerLedger } from "@/lib/payment-records";
import { paymentsEnabled, payoutStatus } from "@/lib/payments";

export const metadata: Metadata = { title: "Earnings" };

const periodLabels: Record<EarningsPeriod, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  all: "All time",
};

export default function EarningsPage({ searchParams }: PageProps<"/dashboard/earnings">) {
  return (
    <>
      <PageHeader title="Earnings" description="What clients paid you, after platform fees and refunds." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Earnings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** Shows a deduction as a negative amount, without turning 0 into "-0". */
function minus(cents: number) {
  return cents === 0 ? 0 : -cents;
}

function parsePeriod(value: string | string[] | undefined): EarningsPeriod {
  return EARNINGS_PERIODS.find((p) => p === value) ?? "all";
}

async function Earnings({ searchParams }: Pick<PageProps<"/dashboard/earnings">, "searchParams">) {
  const trainerId = await requireTrainerProfileId();
  const period = parsePeriod((await searchParams).period);
  const trainer = await db.trainerProfile.findUniqueOrThrow({
    where: { id: trainerId },
    select: { timezone: true, currency: true, stripeAccountId: true, stripeChargesEnabled: true, stripePayoutsEnabled: true },
  });
  const now = new Date();
  const entries = await loadTrainerLedger(trainerId, trainer.timezone, now);
  const held = payoutStatus(trainer, paymentsEnabled()) !== "active";
  const policy = feePolicy();

  const cards = (["this-month", "last-month", "all"] as const).map((p) => ({
    period: p,
    totals: summarize(entries, periodRange(p, now, trainer.timezone), trainer.currency),
  }));
  const allTime = cards[2]!.totals;
  const heldTotals = allTime.filter((t) => t.netCents > 0);
  const range = periodRange(period, now, trainer.timezone);
  const rows = entries.filter((e) => inRange(e.date, range));

  return (
    <div className="space-y-8">
      {held && heldTotals.length > 0 && (
        <Card className="border-amber-300 text-sm dark:border-amber-800">
          Payouts aren&apos;t set up yet, so we&apos;re holding your earnings (
          {heldTotals.map((t) => formatMoney(t.netCents, t.currency)).join(" and ")}) until they are.{" "}
          <Link href="/dashboard/payouts" className="font-medium text-brand">
            Set up payouts
          </Link>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(({ period: p, totals }) => (
          <TotalsCard key={p} title={periodLabels[p]} totals={totals} />
        ))}
      </div>
      <p className="text-xs text-subtle">
        Platform fee: {policy.newClientPercent}% of a new client&apos;s first payment, {policy.repeatPercent}% after
        that. It&apos;s returned when a payment is refunded in full. Months follow your timezone ({trainer.timezone}).
      </p>

      <section aria-labelledby="transactions" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="transactions" className="font-semibold">
            Transactions
          </h2>
          <a
            href={`/api/earnings?period=${period}`}
            download
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Download CSV
          </a>
        </div>
        <nav aria-label="Period" className="flex flex-wrap gap-1">
          {EARNINGS_PERIODS.map((p) => (
            <Link
              key={p}
              href={p === "all" ? "/dashboard/earnings" : `/dashboard/earnings?period=${p}`}
              aria-current={p === period ? "page" : undefined}
              className={cx("rounded-lg px-3 py-1.5 text-sm hover:bg-muted", p === period && "bg-muted font-medium")}
            >
              {periodLabels[p]}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <p className="text-sm text-subtle">
            {entries.length === 0
              ? "No earnings yet. When clients pay for sessions or packages, the payments show up here."
              : "Nothing in this period."}
          </p>
        ) : (
          <>
            <TransactionsList rows={rows} timezone={trainer.timezone} held={held} />
            <TransactionsTable rows={rows} timezone={trainer.timezone} held={held} />
          </>
        )}
      </section>
    </div>
  );
}

function TotalsCard({ title, totals }: { title: string; totals: Totals[] }) {
  const id = `totals-${title.toLowerCase().replaceAll(" ", "-")}`;
  const [main, ...others] = totals;
  return (
    <section aria-labelledby={id}>
      <Card className="h-full space-y-3">
        <h2 id={id} className="text-sm font-medium text-subtle">
          {title}
        </h2>
        <AmountList totals={main!} />
        {others
          .filter((t) => t.grossCents !== 0 || t.refundCents !== 0 || t.deliveredSessions > 0)
          .map((t) => (
            <div key={t.currency} className="border-t border-line pt-3">
              <p className="mb-2 text-xs font-medium text-subtle">In {t.currency.toUpperCase()}</p>
              <AmountList totals={t} />
            </div>
          ))}
      </Card>
    </section>
  );
}

function AmountList({ totals: t }: { totals: Totals }) {
  const money = (cents: number) => formatMoney(cents, t.currency);
  return (
    <div className="space-y-3">
      <p className="text-2xl font-semibold tracking-tight">{money(t.netCents)}</p>
      <dl className="space-y-1 text-sm">
        <Row label="Gross" value={money(t.grossCents)} />
        <Row label="Platform fees" value={money(minus(t.feeCents))} />
        <Row label="Refunds" value={money(minus(t.refundCents))} />
        <Row label="Net" value={money(t.netCents)} strong />
      </dl>
      {t.deliveredSessions > 0 && (
        <p className="text-xs text-subtle">
          {t.deliveredSessions} package {t.deliveredSessions === 1 ? "session" : "sessions"} delivered, worth{" "}
          {money(t.deliveredCents)}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between gap-4", strong && "border-t border-line pt-1 font-medium")}>
      <dt className={strong ? undefined : "text-subtle"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

const typeStyles: Record<LedgerEntry["type"], string> = {
  session_payment: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  package_sale: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  refund: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  package_session: "bg-muted text-subtle",
};

function isPayment(e: LedgerEntry) {
  return e.type === "session_payment" || e.type === "package_sale";
}

function TypeBadges({ entry, held }: { entry: LedgerEntry; held: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge className={cx("whitespace-nowrap", typeStyles[entry.type])}>{entryTypeLabels[entry.type]}</Badge>
      {held && isPayment(entry) && (
        <Badge className="whitespace-nowrap bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Held until payouts are set up
        </Badge>
      )}
    </div>
  );
}

function Details({ entry: e }: { entry: LedgerEntry }) {
  return (
    <>
      {e.description}
      {e.type === "package_session" && <> · delivered value {formatMoney(e.deliveredCents, e.currency)}</>}
    </>
  );
}

const amount = (cents: number, e: LedgerEntry) => (cents === 0 ? "–" : formatMoney(cents, e.currency));

/** Phones: one card per line of the statement. */
function TransactionsList({ rows, timezone, held }: { rows: LedgerEntry[]; timezone: string; held: boolean }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface md:hidden">
      {rows.map((e) => (
        <li key={e.key} className="space-y-1.5 px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <TypeBadges entry={e} held={held} />
            <span className="font-semibold tabular-nums">{amount(e.netCents, e)}</span>
          </div>
          <p>
            {e.clientName} · {formatDate(e.date, timezone)}
          </p>
          <p className="text-subtle">
            <Details entry={e} />
          </p>
          {e.type !== "package_session" && (
            <p className="text-xs text-subtle tabular-nums">
              Gross {amount(e.grossCents, e)} · Fee {amount(minus(e.feeCents), e)} · Refund{" "}
              {amount(minus(e.refundCents), e)}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Tablets and up: the full statement table. */
function TransactionsTable({ rows, timezone, held }: { rows: LedgerEntry[]; timezone: string; held: boolean }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">Payments, refunds and package sessions</caption>
        <thead className="border-b border-line text-xs text-subtle">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Date</th>
            <th scope="col" className="px-4 py-2 font-medium">Type</th>
            <th scope="col" className="px-4 py-2 font-medium">Client</th>
            <th scope="col" className="px-4 py-2 font-medium">Details</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Gross</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Fee</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Refund</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((e) => (
            <tr key={e.key}>
              <td className="whitespace-nowrap px-4 py-2">{formatDate(e.date, timezone)}</td>
              <td className="px-4 py-2">
                <TypeBadges entry={e} held={held} />
              </td>
              <td className="px-4 py-2">{e.clientName}</td>
              <td className="px-4 py-2 text-subtle">
                <Details entry={e} />
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{amount(e.grossCents, e)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{amount(minus(e.feeCents), e)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{amount(minus(e.refundCents), e)}</td>
              <td className="px-4 py-2 text-right font-medium tabular-nums">{amount(e.netCents, e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
