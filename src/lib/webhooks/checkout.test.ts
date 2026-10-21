import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: {
    booking: { updateMany: vi.fn() },
    packagePurchase: { updateMany: vi.fn() },
  },
}));
vi.mock("../payments", () => ({ markBookingPaid: vi.fn(), markPackagePaid: vi.fn() }));

const { db } = await import("../db");
const { markBookingPaid, markPackagePaid } = await import("../payments");
const { handleCheckoutEvent } = await import("./checkout");

function checkoutEvent(
  type: string,
  session: { metadata: Record<string, string>; payment_status?: string; payment_intent?: string | { id: string } | null },
): Stripe.Event {
  return {
    id: "evt_1",
    object: "event",
    type,
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: "pi_123",
        ...session,
      },
    },
  } as unknown as Stripe.Event;
}

beforeEach(() => vi.clearAllMocks());

describe("handleCheckoutEvent", () => {
  it("confirms a paid booking and records the payment intent", async () => {
    await handleCheckoutEvent(checkoutEvent("checkout.session.completed", { metadata: { kind: "booking", bookingId: "b1" } }));
    expect(markBookingPaid).toHaveBeenCalledWith("b1", { checkoutSessionId: "cs_test_1", paymentIntentId: "pi_123" });
    expect(markPackagePaid).not.toHaveBeenCalled();
  });

  it("accepts an expanded payment intent", async () => {
    await handleCheckoutEvent(
      checkoutEvent("checkout.session.completed", { metadata: { kind: "package", purchaseId: "p1" }, payment_intent: { id: "pi_x" } }),
    );
    expect(markPackagePaid).toHaveBeenCalledWith("p1", { checkoutSessionId: "cs_test_1", paymentIntentId: "pi_x" });
  });

  it("treats sessions without a kind as bookings", async () => {
    await handleCheckoutEvent(checkoutEvent("checkout.session.completed", { metadata: { bookingId: "legacy" } }));
    expect(markBookingPaid).toHaveBeenCalledWith("legacy", expect.anything());
  });

  it("waits for the async event when a completed session isn't paid yet", async () => {
    await handleCheckoutEvent(
      checkoutEvent("checkout.session.completed", { metadata: { kind: "booking", bookingId: "b1" }, payment_status: "unpaid" }),
    );
    expect(markBookingPaid).not.toHaveBeenCalled();
    expect(db.booking.updateMany).not.toHaveBeenCalled();

    await handleCheckoutEvent(checkoutEvent("checkout.session.async_payment_succeeded", { metadata: { kind: "booking", bookingId: "b1" } }));
    expect(markBookingPaid).toHaveBeenCalledOnce();
  });

  it("releases an unpaid booking when checkout expires", async () => {
    await handleCheckoutEvent(
      checkoutEvent("checkout.session.expired", { metadata: { kind: "booking", bookingId: "b1" }, payment_status: "unpaid", payment_intent: null }),
    );
    expect(markBookingPaid).not.toHaveBeenCalled();
    expect(db.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "PENDING_PAYMENT" },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
  });

  it("releases an unpaid package purchase when its payment fails", async () => {
    await handleCheckoutEvent(
      checkoutEvent("checkout.session.async_payment_failed", { metadata: { kind: "package", purchaseId: "p1" }, payment_status: "unpaid" }),
    );
    expect(db.packagePurchase.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED" },
    });
  });

  it("ignores other events and sessions without our metadata", async () => {
    await handleCheckoutEvent(checkoutEvent("payment_intent.succeeded", { metadata: { kind: "booking", bookingId: "b1" } }));
    await handleCheckoutEvent(checkoutEvent("checkout.session.completed", { metadata: {} }));
    await handleCheckoutEvent(checkoutEvent("checkout.session.completed", { metadata: { kind: "package" } }));
    expect(markBookingPaid).not.toHaveBeenCalled();
    expect(markPackagePaid).not.toHaveBeenCalled();
  });
});
