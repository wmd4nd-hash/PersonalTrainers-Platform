import { describe, expect, it } from "vitest";
import {
  buildLedger,
  centsToDecimal,
  formatDate,
  ledgerToCsv,
  monthRange,
  paymentStatus,
  periodRange,
  platformFeeKeptCents,
  summarize,
  trainerNetCents,
  type PaymentRecord,
} from "./earnings";

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    kind: "booking",
    id: "b1",
    paidAt: new Date("2026-10-05T10:00:00Z"),
    refundedAt: null,
    currency: "usd",
    amountCents: 5000,
    platformFeeCents: 750,
    refundedCents: 0,
    clientName: "Sam Client",
    description: "60-minute session",
    ...overrides,
  };
}

describe("paymentStatus", () => {
  it("tells paid, partly refunded and refunded apart", () => {
    expect(paymentStatus({ amountCents: 5000, refundedCents: 0 })).toBe("paid");
    expect(paymentStatus({ amountCents: 5000, refundedCents: 2500 })).toBe("partly_refunded");
    expect(paymentStatus({ amountCents: 5000, refundedCents: 5000 })).toBe("refunded");
  });
});

describe("platform fee on refunds", () => {
  it("is kept on partial refunds and returned on full refunds", () => {
    expect(platformFeeKeptCents({ amountCents: 5000, platformFeeCents: 750, refundedCents: 2500 })).toBe(750);
    expect(platformFeeKeptCents({ amountCents: 5000, platformFeeCents: 750, refundedCents: 5000 })).toBe(0);
  });
  it("leaves the trainer the price minus fee and refunds", () => {
    expect(trainerNetCents({ amountCents: 5000, platformFeeCents: 750, refundedCents: 0 })).toBe(4250);
    expect(trainerNetCents({ amountCents: 5000, platformFeeCents: 750, refundedCents: 2500 })).toBe(1750);
    expect(trainerNetCents({ amountCents: 5000, platformFeeCents: 750, refundedCents: 5000 })).toBe(0);
  });
});

describe("buildLedger", () => {
  it("records a payment net of the platform fee", () => {
    const [entry] = buildLedger([payment()]);
    expect(entry).toMatchObject({ type: "session_payment", grossCents: 5000, feeCents: 750, refundCents: 0, netCents: 4250 });
  });

  it("adds a refund line on the refund date that gives the fee back for full refunds", () => {
    const refundedAt = new Date("2026-11-02T09:00:00Z");
    const entries = buildLedger([payment({ refundedCents: 5000, refundedAt })]);
    expect(entries.map((e) => e.type)).toEqual(["refund", "session_payment"]);
    expect(entries[0]).toMatchObject({ date: refundedAt, feeCents: -750, refundCents: 5000, netCents: -4250 });
    expect(entries.reduce((sum, e) => sum + e.netCents, 0)).toBe(0);
  });

  it("keeps the fee on partial refunds", () => {
    const entries = buildLedger([payment({ refundedCents: 2500 })]);
    const refund = entries.find((e) => e.type === "refund")!;
    expect(refund).toMatchObject({ feeCents: 0, refundCents: 2500, netCents: -2500 });
    expect(entries.reduce((sum, e) => sum + e.netCents, 0)).toBe(1750);
  });

  it("dates refunds with an unknown date on the payment date", () => {
    const entries = buildLedger([payment({ kind: "package", refundedCents: 1000 })]);
    expect(entries.every((e) => e.date.getTime() === payment().paidAt.getTime())).toBe(true);
    expect(entries.map((e) => e.type)).toEqual(["refund", "package_sale"]);
  });

  it("shows package sessions as delivered value without counting them as income", () => {
    const entries = buildLedger([], [
      { id: "s1", deliveredAt: new Date("2026-10-06T10:00:00Z"), currency: "usd", valueCents: 6000, clientName: "Priya", description: "Package session" },
    ]);
    expect(entries[0]).toMatchObject({ type: "package_session", grossCents: 0, netCents: 0, deliveredCents: 6000 });
  });

  it("lists newest first", () => {
    const entries = buildLedger([
      payment({ id: "old", paidAt: new Date("2026-09-01T00:00:00Z") }),
      payment({ id: "new", paidAt: new Date("2026-10-01T00:00:00Z") }),
    ]);
    expect(entries.map((e) => e.source.id)).toEqual(["new", "old"]);
  });
});

describe("monthRange", () => {
  it("uses the trainer's timezone for month boundaries", () => {
    // 1 Nov 00:30 in Tokyo is still 31 Oct in UTC.
    const now = new Date("2026-10-31T15:30:00Z");
    const tokyo = monthRange(now, "Asia/Tokyo");
    expect(tokyo.start.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(tokyo.end.toISOString()).toBe("2026-11-30T15:00:00.000Z");
    const utc = monthRange(now, "UTC");
    expect(utc.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("goes back across DST and year boundaries", () => {
    const last = monthRange(new Date("2026-01-15T12:00:00Z"), "America/New_York", 1);
    expect(last.start.toISOString()).toBe("2025-12-01T05:00:00.000Z");
    expect(last.end.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    const october = monthRange(new Date("2026-11-10T12:00:00Z"), "Europe/London", 1);
    expect(october.start.toISOString()).toBe("2026-09-30T23:00:00.000Z"); // BST
    expect(october.end.toISOString()).toBe("2026-11-01T00:00:00.000Z"); // GMT
  });

  it("maps period names to ranges", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    expect(periodRange("all", now, "UTC")).toBeUndefined();
    expect(periodRange("last-month", now, "UTC")?.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("summarize", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const entries = buildLedger([
    // Paid in October, fully refunded in November.
    payment({ id: "a", refundedCents: 5000, refundedAt: new Date("2026-11-03T10:00:00Z") }),
    // Paid in November, repeat-client fee.
    payment({ id: "b", paidAt: new Date("2026-11-04T10:00:00Z"), platformFeeCents: 250 }),
  ]);

  it("attributes payments and refunds to the month they happened", () => {
    const [october] = summarize(entries, monthRange(now, "UTC", 1), "usd");
    expect(october).toMatchObject({ grossCents: 5000, feeCents: 750, refundCents: 0, netCents: 4250, paymentCount: 1 });
    const [november] = summarize(entries, monthRange(now, "UTC"), "usd");
    expect(november).toMatchObject({ grossCents: 5000, feeCents: -500, refundCents: 5000, netCents: 500, paymentCount: 1 });
  });

  it("adds up all time", () => {
    const [all] = summarize(entries, undefined, "usd");
    expect(all).toMatchObject({ grossCents: 10000, feeCents: 250, refundCents: 5000, netCents: 4750, paymentCount: 2 });
  });

  it("returns zeros in the trainer's currency when there is nothing yet, and separates currencies", () => {
    expect(summarize([], undefined, "gbp")).toEqual([
      { currency: "gbp", grossCents: 0, feeCents: 0, refundCents: 0, netCents: 0, paymentCount: 0, deliveredCents: 0, deliveredSessions: 0 },
    ]);
    const mixed = summarize(buildLedger([payment({ currency: "eur" })]), undefined, "gbp");
    expect(mixed.map((t) => t.currency)).toEqual(["gbp", "eur"]);
  });

  it("counts delivered package sessions", () => {
    const withSessions = buildLedger([], [
      { id: "s1", deliveredAt: new Date("2026-11-01T10:00:00Z"), currency: "usd", valueCents: 6000, clientName: "A", description: "" },
      { id: "s2", deliveredAt: new Date("2026-11-02T10:00:00Z"), currency: "usd", valueCents: 6000, clientName: "A", description: "" },
    ]);
    const [t] = summarize(withSessions, undefined, "usd");
    expect(t).toMatchObject({ deliveredSessions: 2, deliveredCents: 12000, netCents: 0, paymentCount: 0 });
  });
});

describe("CSV export", () => {
  it("formats amounts as plain decimals", () => {
    expect(centsToDecimal(4250)).toBe("42.50");
    expect(centsToDecimal(-750)).toBe("-7.50");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(0)).toBe("0.00");
  });

  it("writes one row per entry, oldest first, with dates in the trainer's timezone", () => {
    const csv = ledgerToCsv(
      buildLedger([payment({ paidAt: new Date("2026-10-31T23:30:00Z"), refundedCents: 5000, refundedAt: new Date("2026-11-02T10:00:00Z") })]),
      "Asia/Tokyo",
    );
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("Date,Type,Client,Description,Currency,Gross,Platform fee,Refund,Net,Package session value");
    expect(lines[1]).toBe("2026-11-01,Session payment,Sam Client,60-minute session,USD,50.00,7.50,0.00,42.50,0.00");
    expect(lines[2]).toBe("2026-11-02,Refund,Sam Client,60-minute session,USD,0.00,-7.50,50.00,-42.50,0.00");
  });

  it("escapes commas and quotes and neutralises formulas", () => {
    const csv = ledgerToCsv(buildLedger([payment({ clientName: "=HYPERLINK(\"x\")", description: "Strength, mobility" })]), "UTC");
    const row = csv.split("\r\n")[1];
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain(`"Strength, mobility"`);
  });
});

describe("formatDate", () => {
  it("shows the calendar date in the given timezone", () => {
    const instant = new Date("2026-10-31T23:30:00Z");
    expect(formatDate(instant, "UTC")).toBe("Oct 31, 2026");
    expect(formatDate(instant, "Asia/Tokyo")).toBe("Nov 1, 2026");
  });
});
