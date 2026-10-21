import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../payments", () => ({
  applyAccountUpdate: vi.fn(),
  disconnectAccount: vi.fn(),
  syncRefundedCents: vi.fn(),
}));

const { applyAccountUpdate, disconnectAccount, syncRefundedCents } = await import("../payments");
const { handleConnectEvent } = await import("./connect");
const { handleChargeEvent } = await import("./charges");

function event(type: string, object: object, account?: string): Stripe.Event {
  return { id: "evt_1", object: "event", type, account, data: { object } } as unknown as Stripe.Event;
}

beforeEach(() => vi.clearAllMocks());

describe("handleConnectEvent", () => {
  it("saves a connected account's capabilities when it changes", async () => {
    const account = { id: "acct_123", object: "account", charges_enabled: true, payouts_enabled: false };
    await handleConnectEvent(event("account.updated", account, "acct_123"));
    expect(applyAccountUpdate).toHaveBeenCalledWith(account);
  });

  it("disconnects a trainer who removed the platform from their Stripe account", async () => {
    await handleConnectEvent(event("account.application.deauthorized", { id: "ca_1", object: "application" }, "acct_123"));
    expect(disconnectAccount).toHaveBeenCalledWith("acct_123");
  });

  it("ignores deauthorizations without an account and unrelated events", async () => {
    await handleConnectEvent(event("account.application.deauthorized", { id: "ca_1", object: "application" }));
    await handleConnectEvent(event("checkout.session.completed", { id: "cs_1" }));
    expect(disconnectAccount).not.toHaveBeenCalled();
    expect(applyAccountUpdate).not.toHaveBeenCalled();
  });
});

describe("handleChargeEvent", () => {
  it("syncs refunds made in Stripe onto our records", async () => {
    await handleChargeEvent(event("charge.refunded", { id: "ch_1", object: "charge", payment_intent: "pi_1", amount_refunded: 2500 }));
    expect(syncRefundedCents).toHaveBeenCalledWith("pi_1", 2500);
  });

  it("handles an expanded payment intent and skips charges without one", async () => {
    await handleChargeEvent(event("charge.refunded", { id: "ch_1", object: "charge", payment_intent: { id: "pi_2" }, amount_refunded: 100 }));
    await handleChargeEvent(event("charge.refunded", { id: "ch_2", object: "charge", payment_intent: null, amount_refunded: 100 }));
    expect(syncRefundedCents).toHaveBeenCalledTimes(1);
    expect(syncRefundedCents).toHaveBeenCalledWith("pi_2", 100);
  });
});
