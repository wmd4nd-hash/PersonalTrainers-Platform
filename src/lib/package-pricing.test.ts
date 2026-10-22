import { describe, expect, it } from "vitest";
import {
  fullPriceCents,
  isPaymentHoldOpen,
  purchaseState,
  savingsPercent,
  unusedRefundCents,
  unusedSessions,
  type PurchaseLike,
} from "./package-pricing";

describe("savingsPercent", () => {
  it("compares the package with the same number of single sessions", () => {
    expect(fullPriceCents(5, 8000)).toBe(40000);
    expect(savingsPercent(36000, 5, 8000)).toBe(10);
    expect(savingsPercent(68000, 10, 8000)).toBe(15);
  });

  it("rounds toward zero so it never overstates the saving", () => {
    // 325.00 for five 65.00 sessions would be 0%, 293.00 is a 9.8% saving.
    expect(savingsPercent(29300, 5, 6500)).toBe(9);
    expect(savingsPercent(29200, 5, 6500)).toBe(10);
  });

  it("is zero when the package costs the same as single sessions", () => {
    expect(savingsPercent(40000, 5, 8000)).toBe(0);
  });

  it("is negative when the package costs more", () => {
    expect(savingsPercent(44000, 5, 8000)).toBe(-10);
  });

  it("is zero when there is no single rate to compare with", () => {
    expect(savingsPercent(10000, 5, 0)).toBe(0);
    expect(savingsPercent(10000, 0, 5000)).toBe(0);
  });
});

describe("unusedSessions", () => {
  it("counts what is left and never goes below zero", () => {
    expect(unusedSessions({ sessionsTotal: 5, sessionsUsed: 1 })).toBe(4);
    expect(unusedSessions({ sessionsTotal: 5, sessionsUsed: 5 })).toBe(0);
    expect(unusedSessions({ sessionsTotal: 5, sessionsUsed: 7 })).toBe(0);
    expect(unusedSessions({ sessionsTotal: 5, sessionsUsed: -1 })).toBe(5);
  });
});

describe("unusedRefundCents", () => {
  const base = { priceCents: 30000, refundedCents: 0, sessionsTotal: 10, sessionsUsed: 0 };

  it("refunds everything when no sessions were used", () => {
    expect(unusedRefundCents(base)).toBe(30000);
  });

  it("refunds the unused share pro rata", () => {
    expect(unusedRefundCents({ ...base, sessionsUsed: 4 })).toBe(18000);
    expect(unusedRefundCents({ ...base, sessionsUsed: 9 })).toBe(3000);
  });

  it("refunds nothing once every session is used", () => {
    expect(unusedRefundCents({ ...base, sessionsUsed: 10 })).toBe(0);
  });

  it("rounds uneven shares to the nearest cent", () => {
    const pack = { priceCents: 10000, refundedCents: 0, sessionsTotal: 3 };
    expect(unusedRefundCents({ ...pack, sessionsUsed: 2 })).toBe(3333);
    expect(unusedRefundCents({ ...pack, sessionsUsed: 1 })).toBe(6667);
  });

  it("subtracts what was already refunded", () => {
    expect(unusedRefundCents({ ...base, sessionsUsed: 4, refundedCents: 5000 })).toBe(13000);
  });

  it("never refunds more than is left of the payment", () => {
    expect(unusedRefundCents({ ...base, refundedCents: 30000 })).toBe(0);
    expect(unusedRefundCents({ ...base, sessionsUsed: 5, refundedCents: 20000 })).toBe(0);
    expect(unusedRefundCents({ ...base, refundedCents: 40000 })).toBe(0);
  });

  it("handles free or empty packages", () => {
    expect(unusedRefundCents({ ...base, priceCents: 0 })).toBe(0);
    expect(unusedRefundCents({ ...base, sessionsTotal: 0 })).toBe(0);
  });
});

describe("isPaymentHoldOpen", () => {
  const now = new Date("2026-03-10T10:00:00Z");

  it("is open for 35 minutes after checkout starts", () => {
    expect(isPaymentHoldOpen(new Date("2026-03-10T09:30:00Z"), now)).toBe(true);
    expect(isPaymentHoldOpen(new Date("2026-03-10T09:25:00Z"), now)).toBe(false);
    expect(isPaymentHoldOpen(new Date("2026-03-10T09:20:00Z"), now)).toBe(false);
  });
});

describe("purchaseState", () => {
  const now = new Date("2026-03-10T10:00:00Z");
  const active: PurchaseLike = {
    status: "ACTIVE",
    sessionsTotal: 5,
    sessionsUsed: 1,
    expiresAt: new Date("2026-04-10T10:00:00Z"),
    createdAt: new Date("2026-03-01T10:00:00Z"),
  };

  it("treats a paid, in-date purchase with sessions left as usable", () => {
    expect(purchaseState(active, now)).toBe("usable");
  });

  it("catches active purchases that have expired but are not marked yet", () => {
    expect(purchaseState({ ...active, expiresAt: now }, now)).toBe("expired");
  });

  it("treats an active purchase with no sessions left as used up", () => {
    expect(purchaseState({ ...active, sessionsUsed: 5 }, now)).toBe("used-up");
  });

  it("only shows recent unpaid purchases as awaiting payment", () => {
    const pending = { ...active, status: "PENDING_PAYMENT" as const };
    expect(purchaseState({ ...pending, createdAt: new Date("2026-03-10T09:50:00Z") }, now)).toBe(
      "awaiting-payment",
    );
    expect(purchaseState({ ...pending, createdAt: new Date("2026-03-10T09:00:00Z") }, now)).toBe("abandoned");
  });

  it("maps closed statuses directly", () => {
    expect(purchaseState({ ...active, status: "EXHAUSTED" }, now)).toBe("used-up");
    expect(purchaseState({ ...active, status: "EXPIRED" }, now)).toBe("expired");
    expect(purchaseState({ ...active, status: "CANCELLED" }, now)).toBe("cancelled");
  });
});
