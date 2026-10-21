import { TZDate } from "@date-fns/tz";
import { addMonths, format, startOfMonth } from "date-fns";

/**
 * Pure earnings maths. Everything here works on plain records so it can be
 * unit-tested; the pages and the CSV route load the records from the database.
 *
 * Money is integer cents. Fee policy on refunds: the platform keeps its fee
 * unless the payment is refunded in full (then the fee goes back too).
 */

export type PaymentKind = "booking" | "package";

/** A card payment (real or simulated) for one session or one package. */
export type PaymentRecord = {
  kind: PaymentKind;
  id: string;
  paidAt: Date;
  /** When the money went back. Null when unknown; the payment date is used instead. */
  refundedAt: Date | null;
  currency: string;
  amountCents: number;
  /** Fee charged when the client paid. */
  platformFeeCents: number;
  refundedCents: number;
  clientName: string;
  description: string;
};

/** A session paid with a package credit: value delivered, not new money. */
export type PackageSessionRecord = {
  id: string;
  deliveredAt: Date;
  currency: string;
  valueCents: number;
  clientName: string;
  description: string;
};

export type PaymentStatus = "paid" | "partly_refunded" | "refunded";

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  paid: "Paid",
  partly_refunded: "Partly refunded",
  refunded: "Refunded",
};

type Amounts = { amountCents: number; refundedCents: number };

export function paymentStatus({ amountCents, refundedCents }: Amounts): PaymentStatus {
  if (refundedCents <= 0) return "paid";
  return refundedCents >= amountCents ? "refunded" : "partly_refunded";
}

/** The fee the platform ends up keeping on a payment. */
export function platformFeeKeptCents(p: Amounts & { platformFeeCents: number }): number {
  return paymentStatus(p) === "refunded" ? 0 : p.platformFeeCents;
}

/** What the trainer ends up with from a payment, after fees and refunds. */
export function trainerNetCents(p: Amounts & { platformFeeCents: number }): number {
  return p.amountCents - p.refundedCents - platformFeeKeptCents(p);
}

export type EntryType = "session_payment" | "package_sale" | "refund" | "package_session";

export const entryTypeLabels: Record<EntryType, string> = {
  session_payment: "Session payment",
  package_sale: "Package sale",
  refund: "Refund",
  package_session: "Package session",
};

/** One line of a trainer's earnings statement. Amounts are signed from the trainer's side. */
export type LedgerEntry = {
  key: string;
  type: EntryType;
  date: Date;
  source: { kind: PaymentKind; id: string };
  clientName: string;
  description: string;
  currency: string;
  /** What the client paid (payments only). */
  grossCents: number;
  /** Platform fee: positive when charged, negative when returned with a full refund. */
  feeCents: number;
  /** Money returned to the client (refunds only). */
  refundCents: number;
  /** gross - fee - refund */
  netCents: number;
  /** Per-session value of package sessions delivered (not money received). */
  deliveredCents: number;
};

/** Turns payments and delivered package sessions into statement lines, newest first. */
export function buildLedger(payments: PaymentRecord[], sessions: PackageSessionRecord[] = []): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const p of payments) {
    const source = { kind: p.kind, id: p.id };
    const shared = { source, clientName: p.clientName, description: p.description, currency: p.currency };
    entries.push({
      ...shared,
      key: `${p.kind}:${p.id}:payment`,
      type: p.kind === "booking" ? "session_payment" : "package_sale",
      date: p.paidAt,
      grossCents: p.amountCents,
      feeCents: p.platformFeeCents,
      refundCents: 0,
      netCents: p.amountCents - p.platformFeeCents,
      deliveredCents: 0,
    });

    const refunded = Math.min(Math.max(p.refundedCents, 0), p.amountCents);
    if (refunded > 0) {
      const feeReturned = p.platformFeeCents - platformFeeKeptCents({ ...p, refundedCents: refunded });
      entries.push({
        ...shared,
        key: `${p.kind}:${p.id}:refund`,
        type: "refund",
        date: p.refundedAt ?? p.paidAt,
        grossCents: 0,
        feeCents: 0 - feeReturned, // not -feeReturned, which gives -0
        refundCents: refunded,
        netCents: feeReturned - refunded,
        deliveredCents: 0,
      });
    }
  }

  for (const s of sessions) {
    entries.push({
      key: `session:${s.id}`,
      type: "package_session",
      date: s.deliveredAt,
      source: { kind: "booking", id: s.id },
      clientName: s.clientName,
      description: s.description,
      currency: s.currency,
      grossCents: 0,
      feeCents: 0,
      refundCents: 0,
      netCents: 0,
      deliveredCents: s.valueCents,
    });
  }

  // Newest first; on the same instant show the payment before its refund.
  const order: Record<EntryType, number> = { refund: 0, session_payment: 1, package_sale: 1, package_session: 2 };
  return entries.sort((a, b) => b.date.getTime() - a.date.getTime() || order[a.type] - order[b.type]);
}

/** Half-open interval [start, end). */
export type DateRange = { start: Date; end: Date };

export function inRange(date: Date, range?: DateRange): boolean {
  if (!range) return true;
  const t = date.getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

/** A calendar month in the given timezone: 0 = the month containing `now`, 1 = the one before. */
export function monthRange(now: Date, timezone: string, monthsBack = 0): DateRange {
  const thisMonth = startOfMonth(new TZDate(now, timezone));
  const start = addMonths(thisMonth, -monthsBack);
  return { start: new Date(start.getTime()), end: new Date(addMonths(start, 1).getTime()) };
}

export const EARNINGS_PERIODS = ["this-month", "last-month", "all"] as const;
export type EarningsPeriod = (typeof EARNINGS_PERIODS)[number];

export function periodRange(period: EarningsPeriod, now: Date, timezone: string): DateRange | undefined {
  if (period === "this-month") return monthRange(now, timezone, 0);
  if (period === "last-month") return monthRange(now, timezone, 1);
  return undefined;
}

export type Totals = {
  currency: string;
  grossCents: number;
  feeCents: number;
  refundCents: number;
  netCents: number;
  /** Card payments and package sales received. */
  paymentCount: number;
  deliveredCents: number;
  deliveredSessions: number;
};

function emptyTotals(currency: string): Totals {
  return {
    currency,
    grossCents: 0,
    feeCents: 0,
    refundCents: 0,
    netCents: 0,
    paymentCount: 0,
    deliveredCents: 0,
    deliveredSessions: 0,
  };
}

/**
 * Adds up entries in a period, one total per currency. `currency` is always
 * included (first) so an empty period still shows zeros in the trainer's currency.
 */
export function summarize(entries: LedgerEntry[], range: DateRange | undefined, currency: string): Totals[] {
  const byCurrency = new Map<string, Totals>([[currency, emptyTotals(currency)]]);
  for (const e of entries) {
    if (!inRange(e.date, range)) continue;
    let t = byCurrency.get(e.currency);
    if (!t) byCurrency.set(e.currency, (t = emptyTotals(e.currency)));
    t.grossCents += e.grossCents;
    t.feeCents += e.feeCents;
    t.refundCents += e.refundCents;
    t.netCents += e.netCents;
    t.deliveredCents += e.deliveredCents;
    if (e.type === "session_payment" || e.type === "package_sale") t.paymentCount += 1;
    if (e.type === "package_session") t.deliveredSessions += 1;
  }
  return [...byCurrency.values()];
}

/** "Oct 21, 2026" in the given timezone. */
export function formatDate(date: Date, timezone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, year: "numeric", month: "short", day: "numeric" }).format(date);
}

/** "42.50", "-7.50": plain decimal amounts for spreadsheets. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Quotes a CSV text cell and stops spreadsheets from running it as a formula. */
function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export const CSV_HEADER = [
  "Date",
  "Type",
  "Client",
  "Description",
  "Currency",
  "Gross",
  "Platform fee",
  "Refund",
  "Net",
  "Package session value",
];

/** Earnings statement as CSV, dates in the trainer's timezone, oldest first. */
export function ledgerToCsv(entries: LedgerEntry[], timezone: string): string {
  const rows = [...entries].reverse().map((e) => [
    format(new TZDate(e.date, timezone), "yyyy-MM-dd"),
    csvText(entryTypeLabels[e.type]),
    csvText(e.clientName),
    csvText(e.description),
    e.currency.toUpperCase(),
    centsToDecimal(e.grossCents),
    centsToDecimal(e.feeCents),
    centsToDecimal(e.refundCents),
    centsToDecimal(e.netCents),
    centsToDecimal(e.deliveredCents),
  ]);
  return [CSV_HEADER, ...rows].map((row) => row.join(",")).join("\r\n") + "\r\n";
}
