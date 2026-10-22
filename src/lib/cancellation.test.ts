import { describe, expect, it } from "vitest";
import { cancellationOutcome } from "./cancellation";

const startsAt = new Date("2026-03-10T10:00:00Z");
const base = { startsAt, windowHours: 24, lateFeePercent: 100, paidCents: 6500 };

describe("cancellationOutcome edge cases", () => {
  it("treats exactly the window boundary as on time", () => {
    const r = cancellationOutcome({ ...base, cancelledBy: "CLIENT", now: new Date("2026-03-09T10:00:00Z") });
    expect(r).toMatchObject({ late: false, refundCents: 6500 });
  });

  it("keeps everything and the package credit when a late fee of 100% applies", () => {
    const r = cancellationOutcome({ ...base, cancelledBy: "CLIENT", now: new Date("2026-03-10T09:00:00Z") });
    expect(r).toEqual({ late: true, refundCents: 0, keptCents: 6500, restoreCredit: false });
  });

  it("waives the late fee on a session the trainer moved", () => {
    const now = new Date("2026-03-10T09:00:00Z");
    const r = cancellationOutcome({ ...base, cancelledBy: "CLIENT", now, waiveLateFee: true });
    expect(r).toEqual({ late: false, refundCents: 6500, keptCents: 0, restoreCredit: true });
  });

  it("never penalises the client when an admin cancels", () => {
    const r = cancellationOutcome({ ...base, cancelledBy: "ADMIN", now: new Date("2026-03-10T09:59:00Z") });
    expect(r).toEqual({ late: false, refundCents: 6500, keptCents: 0, restoreCredit: true });
  });

  it("restores the credit of a package session cancelled in time (nothing to refund)", () => {
    const r = cancellationOutcome({ ...base, paidCents: 0, cancelledBy: "CLIENT", now: new Date("2026-03-01T10:00:00Z") });
    expect(r).toEqual({ late: false, refundCents: 0, keptCents: 0, restoreCredit: true });
  });

  it("splits odd amounts without losing a cent", () => {
    const r = cancellationOutcome({ ...base, lateFeePercent: 50, paidCents: 999, cancelledBy: "CLIENT", now: new Date("2026-03-10T08:00:00Z") });
    expect(r.refundCents + r.keptCents).toBe(999);
  });

  it("ignores out-of-range input", () => {
    const r = cancellationOutcome({ ...base, lateFeePercent: 150, paidCents: -100, cancelledBy: "CLIENT", now: new Date("2026-03-10T08:00:00Z") });
    expect(r).toMatchObject({ refundCents: 0, keptCents: 0 });
  });
});
