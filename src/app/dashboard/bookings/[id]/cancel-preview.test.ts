import { describe, expect, it } from "vitest";
import { cancelPreview, type CancelPreviewInput } from "./cancel-preview";

const startsAt = new Date("2026-03-05T10:00:00Z");
const early = new Date("2026-03-03T10:00:00Z"); // 48 hours ahead
const late = new Date("2026-03-05T08:00:00Z"); // 2 hours ahead

function input(overrides: Partial<CancelPreviewInput> = {}): CancelPreviewInput {
  return {
    viewer: "CLIENT",
    status: "CONFIRMED",
    startsAt,
    now: early,
    windowHours: 24,
    lateFeePercent: 100,
    priceCents: 6500,
    refundedCents: 0,
    currency: "gbp",
    paidWithPackage: false,
    clientName: "Sam",
    ...overrides,
  };
}

describe("cancelPreview", () => {
  it("promises a full refund before the window", () => {
    expect(cancelPreview(input())).toEqual({
      tone: "neutral",
      text: "If you cancel now, you'll get a full refund of £65.00.",
    });
  });

  it("warns about no refund inside the window", () => {
    expect(cancelPreview(input({ now: late }))).toMatchObject({ tone: "warning", text: expect.stringContaining("won't get a refund") });
  });

  it("explains a partial late fee", () => {
    expect(cancelPreview(input({ now: late, lateFeePercent: 50 })).text).toContain("£32.50 back and £32.50");
  });

  it("covers package sessions", () => {
    expect(cancelPreview(input({ paidWithPackage: true })).text).toContain("goes back to your package");
    expect(cancelPreview(input({ paidWithPackage: true, now: late })).text).toContain("won't go back");
  });

  it("tells the trainer the client is refunded in full, even late", () => {
    expect(cancelPreview(input({ viewer: "TRAINER", now: late })).text).toBe(
      "If you cancel, Sam gets a full refund of £65.00.",
    );
  });

  it("is free while payment is pending", () => {
    expect(cancelPreview(input({ status: "PENDING_PAYMENT" })).text).toContain("haven't been charged");
  });
});
