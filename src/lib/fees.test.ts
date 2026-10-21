import { describe, expect, it } from "vitest";
import { cancellationOutcome, describePolicy } from "./cancellation";
import { perSessionCents, platformFeeCents } from "./fees";

const policy = { newClientPercent: 15, repeatPercent: 5 };

describe("platformFeeCents", () => {
  it("charges the new-client rate first, then the repeat rate", () => {
    expect(platformFeeCents(10000, { isNewClient: true }, policy)).toBe(1500);
    expect(platformFeeCents(10000, { isNewClient: false }, policy)).toBe(500);
  });
  it("rounds to whole cents", () => {
    expect(platformFeeCents(999, { isNewClient: true }, policy)).toBe(150);
  });
});

describe("perSessionCents", () => {
  it("splits a package price evenly", () => {
    expect(perSessionCents(30000, 5)).toBe(6000);
    expect(perSessionCents(10000, 3)).toBe(3333);
    expect(perSessionCents(10000, 0)).toBe(0);
  });
});

describe("cancellationOutcome", () => {
  const startsAt = new Date("2026-03-10T10:00:00Z");
  const base = { startsAt, windowHours: 24, lateFeePercent: 50, paidCents: 8000 };

  it("refunds in full when the client cancels in time", () => {
    const r = cancellationOutcome({ ...base, cancelledBy: "CLIENT", now: new Date("2026-03-09T09:00:00Z") });
    expect(r).toEqual({ late: false, refundCents: 8000, keptCents: 0, restoreCredit: true });
  });
  it("keeps the late fee when the client cancels inside the window", () => {
    const r = cancellationOutcome({ ...base, cancelledBy: "CLIENT", now: new Date("2026-03-09T12:00:00Z") });
    expect(r).toEqual({ late: true, refundCents: 4000, keptCents: 4000, restoreCredit: false });
  });
  it("always refunds in full when the trainer cancels", () => {
    const r = cancellationOutcome({ ...base, cancelledBy: "TRAINER", now: new Date("2026-03-10T09:30:00Z") });
    expect(r.refundCents).toBe(8000);
    expect(r.late).toBe(false);
  });
  it("restores package credit for late cancellations when there is no fee", () => {
    const r = cancellationOutcome({ ...base, lateFeePercent: 0, paidCents: 0, cancelledBy: "CLIENT", now: new Date("2026-03-10T09:00:00Z") });
    expect(r.restoreCredit).toBe(true);
  });
  it("describes the policy in plain words", () => {
    expect(describePolicy(24, 100)).toBe("Free cancellation up to 24 hours before the session. After that, the full price is charged.");
    expect(describePolicy(12, 0)).toBe("Free cancellation at any time.");
  });
});
