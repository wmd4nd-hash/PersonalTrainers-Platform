import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./stripe", () => ({ getStripe: vi.fn(() => null), appUrl: (path: string) => `https://app.test${path}` }));
vi.mock("./events", () => ({ bookingConfirmed: vi.fn(), packageActivated: vi.fn() }));
vi.mock("./notify", () => ({ notify: vi.fn() }));

/**
 * A tiny in-memory stand-in for the Prisma tables payments.ts touches,
 * enough to check compare-and-set updates and refund bookkeeping.
 */
type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { lt?: number; not?: unknown; in?: unknown[] };
      if ("lt" in c) return typeof value === "number" && value < c.lt!;
      if ("not" in c) return value !== c.not;
      if ("in" in c) return c.in!.includes(value);
    }
    return value === cond;
  });
}

function table() {
  const rows = new Map<string, Row>();
  return {
    rows,
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = rows.get(where.id);
      if (!row) throw new Error("not found");
      return structuredClone(row);
    }),
    findUnique: vi.fn(async ({ where }: { where: Where }) => {
      const row = [...rows.values()].find((r) => matches(r, where));
      return row ? structuredClone(row) : null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      Object.assign(rows.get(where.id)!, data);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      let count = 0;
      for (const row of rows.values()) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count++;
        }
      }
      return { count };
    }),
    count: vi.fn(async ({ where }: { where: Where }) => [...rows.values()].filter((r) => matches(r, where)).length),
  };
}

const fakeDb = {
  booking: table(),
  packagePurchase: table(),
  trainerProfile: table(),
  user: { findMany: vi.fn(async () => [{ id: "admin1" }]) },
};
vi.mock("./db", () => ({ db: fakeDb }));

const { getStripe } = await import("./stripe");
const { notify } = await import("./notify");
const { bookingConfirmed } = await import("./events");
const payments = await import("./payments");

const trainer = {
  id: "t1",
  userId: "tu1",
  stripeAccountId: null as string | null,
  stripeChargesEnabled: false,
  stripePayoutsEnabled: false,
  user: { name: "Maya", email: "maya@example.com" },
};

function addBooking(overrides: Partial<Row> = {}) {
  const row: Row = {
    id: "b1",
    trainerId: "t1",
    clientId: "c1",
    status: "CONFIRMED",
    priceCents: 5000,
    currency: "usd",
    platformFeeCents: 750,
    refundedCents: 0,
    packagePurchaseId: null,
    stripePaymentIntentId: "pi_1",
    stripeCheckoutSessionId: "cs_1",
    startsAt: new Date("2030-01-01T10:00:00Z"),
    client: { email: "client@example.com" },
    trainer: { ...trainer },
    ...overrides,
  };
  fakeDb.booking.rows.set(row.id, row);
  return row;
}

function fakeStripe({ destination = null as string | null, failRefund = false } = {}) {
  return {
    paymentIntents: {
      retrieve: vi.fn(async (id: string) => ({ id, transfer_data: destination ? { destination } : null, latest_charge: "ch_1" })),
    },
    refunds: {
      create: vi.fn(async () => {
        if (failRefund) throw new Error("card_declined");
        return { id: "re_1" };
      }),
    },
    charges: { retrieve: vi.fn(async () => ({ application_fee: "fee_1" })) },
    applicationFees: {
      retrieve: vi.fn(async () => ({ amount: 750, amount_refunded: 375 })),
      createRefund: vi.fn(async () => ({})),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: "cs_new", url: "https://checkout.stripe.test/cs_new" })),
        retrieve: vi.fn(),
        expire: vi.fn(),
      },
    },
  };
}

function useStripe(stripe: ReturnType<typeof fakeStripe> | null) {
  vi.mocked(getStripe).mockReturnValue(stripe as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb.booking.rows.clear();
  fakeDb.packagePurchase.rows.clear();
  fakeDb.trainerProfile.rows.clear();
  useStripe(null);
});

describe("payoutStatus", () => {
  const account = { stripeAccountId: "acct_1", stripeChargesEnabled: true, stripePayoutsEnabled: true };

  it("is not started without an account, pending until Stripe enables both, then active", () => {
    expect(payments.payoutStatus({ ...account, stripeAccountId: null }, true)).toBe("not_started");
    expect(payments.payoutStatus({ ...account, stripePayoutsEnabled: false }, true)).toBe("pending");
    expect(payments.payoutStatus(account, true)).toBe("active");
  });

  it("only counts simulated accounts while Stripe is off", () => {
    const simulated = { ...account, stripeAccountId: "acct_sim_t1" };
    expect(payments.payoutStatus(simulated, false)).toBe("active");
    expect(payments.payoutStatus(simulated, true)).toBe("not_started");
  });
});

describe("refundParams", () => {
  const base = { kind: "booking" as const, id: "b1", paymentIntentId: "pi_1", totalCents: 5000 };

  it("takes the money back from the trainer and returns the fee on a full refund", () => {
    expect(payments.refundParams({ ...base, amount: 5000, after: 5000 }, true)).toMatchObject({
      payment_intent: "pi_1",
      amount: 5000,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: { kind: "booking", bookingId: "b1" },
    });
  });

  it("keeps the platform fee on a partial refund", () => {
    expect(payments.refundParams({ ...base, amount: 2500, after: 2500 }, true)).toMatchObject({
      reverse_transfer: true,
      refund_application_fee: false,
    });
  });

  it("is a plain refund when the platform collected the payment", () => {
    const params = payments.refundParams({ ...base, kind: "package", amount: 5000, after: 5000 }, false);
    expect(params).not.toHaveProperty("reverse_transfer");
    expect(params).not.toHaveProperty("refund_application_fee");
    expect(params.metadata).toEqual({ kind: "package", purchaseId: "b1" });
  });
});

describe("refundBooking", () => {
  it("never refunds more than was paid, however often it is called", async () => {
    addBooking({ stripePaymentIntentId: "pi_sim_b1" });
    expect(await payments.refundBooking("b1", 3000)).toBe(3000);
    expect(await payments.refundBooking("b1", 3000)).toBe(2000);
    expect(await payments.refundBooking("b1", 3000)).toBe(0);
    expect(fakeDb.booking.rows.get("b1")!.refundedCents).toBe(5000);
  });

  it("does nothing for zero or negative amounts", async () => {
    addBooking();
    expect(await payments.refundBooking("b1", 0)).toBe(0);
    expect(await payments.refundBooking("b1", -10)).toBe(0);
    expect(fakeDb.booking.updateMany).not.toHaveBeenCalled();
  });

  it("reverses the transfer of a destination charge, with an idempotency key per amount", async () => {
    const stripe = fakeStripe({ destination: "acct_trainer" });
    useStripe(stripe);
    addBooking();
    await payments.refundBooking("b1", 5000);
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_1", amount: 5000, reverse_transfer: true, refund_application_fee: true }),
      { idempotencyKey: "refund-booking-b1-5000" },
    );
    expect(stripe.applicationFees.createRefund).not.toHaveBeenCalled();
  });

  it("returns the rest of the platform fee when a later refund completes a partial one", async () => {
    const stripe = fakeStripe({ destination: "acct_trainer" });
    useStripe(stripe);
    addBooking({ refundedCents: 2500 });
    await payments.refundBooking("b1", 2500);
    expect(stripe.applicationFees.createRefund).toHaveBeenCalledWith("fee_1", { amount: 375 }, expect.anything());
  });

  it("refunds a platform-held payment without touching transfers", async () => {
    const stripe = fakeStripe();
    useStripe(stripe);
    addBooking();
    await payments.refundBooking("b1", 1000);
    const [params] = stripe.refunds.create.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params).not.toHaveProperty("reverse_transfer");
  });

  it("undoes the record and tells admins when Stripe refuses", async () => {
    useStripe(fakeStripe({ failRefund: true }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    addBooking();
    await expect(payments.refundBooking("b1", 5000)).rejects.toBeInstanceOf(payments.RefundError);
    expect(fakeDb.booking.rows.get("b1")!.refundedCents).toBe(0);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "admin1", type: "payment.refund_failed" }));
  });

  it("doesn't call Stripe for payments made while it was off", async () => {
    const stripe = fakeStripe();
    useStripe(stripe);
    addBooking({ stripePaymentIntentId: "pi_sim_b1" });
    expect(await payments.refundBooking("b1", 5000)).toBe(5000);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe("markBookingPaid", () => {
  it("confirms a pending booking once", async () => {
    addBooking({ status: "PENDING_PAYMENT", stripePaymentIntentId: null });
    await payments.markBookingPaid("b1", { checkoutSessionId: "cs_1", paymentIntentId: "pi_9" });
    await payments.markBookingPaid("b1", { checkoutSessionId: "cs_1", paymentIntentId: "pi_9" });
    expect(fakeDb.booking.rows.get("b1")).toMatchObject({ status: "CONFIRMED", stripePaymentIntentId: "pi_9", refundedCents: 0 });
    expect(bookingConfirmed).toHaveBeenCalledOnce();
  });

  it("refunds in full a payment that lands after the booking was cancelled", async () => {
    addBooking({ status: "CANCELLED", stripePaymentIntentId: null });
    await payments.markBookingPaid("b1", { paymentIntentId: "pi_sim_b1" });
    await payments.markBookingPaid("b1", { paymentIntentId: "pi_sim_b1" });
    expect(fakeDb.booking.rows.get("b1")).toMatchObject({ status: "CANCELLED", refundedCents: 5000 });
    expect(bookingConfirmed).not.toHaveBeenCalled();
  });
});

describe("beginBookingCheckout", () => {
  it("confirms straight away with a simulated payment when Stripe is off", async () => {
    addBooking({ status: "PENDING_PAYMENT", stripePaymentIntentId: null, platformFeeCents: 0 });
    const url = await payments.beginBookingCheckout("b1");
    expect(url).toBe("/dashboard/bookings/b1?booked=1");
    // First paid booking with this trainer: new-client rate.
    expect(fakeDb.booking.rows.get("b1")).toMatchObject({
      status: "CONFIRMED",
      platformFeeCents: 750,
      stripePaymentIntentId: "pi_sim_b1",
    });
  });

  it("sends the money to a trainer who has finished payouts setup, minus the platform fee", async () => {
    const stripe = fakeStripe();
    useStripe(stripe);
    addBooking({
      status: "PENDING_PAYMENT",
      stripePaymentIntentId: null,
      trainer: { ...trainer, stripeAccountId: "acct_trainer", stripeChargesEnabled: true, stripePayoutsEnabled: true },
    });
    await payments.beginBookingCheckout("b1");
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { kind: "booking", bookingId: "b1" },
        payment_intent_data: {
          metadata: { kind: "booking", bookingId: "b1" },
          application_fee_amount: 750,
          transfer_data: { destination: "acct_trainer" },
        },
      }),
    );
  });

  it("lets the platform collect when the trainer can't take charges yet", async () => {
    const stripe = fakeStripe();
    useStripe(stripe);
    addBooking({
      status: "PENDING_PAYMENT",
      stripePaymentIntentId: null,
      trainer: { ...trainer, stripeAccountId: "acct_trainer", stripeChargesEnabled: false },
    });
    await payments.beginBookingCheckout("b1");
    const [params] = stripe.checkout.sessions.create.mock.calls[0] as unknown as [{ payment_intent_data: object }];
    expect(params.payment_intent_data).toEqual({ metadata: { kind: "booking", bookingId: "b1" } });
  });

  it("doesn't start a second checkout for a booking that is no longer awaiting payment", async () => {
    const stripe = fakeStripe();
    useStripe(stripe);
    addBooking({ status: "CONFIRMED" });
    expect(await payments.beginBookingCheckout("b1")).toBe("/dashboard/bookings/b1?booked=1");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("applyAccountUpdate", () => {
  beforeEach(() => {
    fakeDb.trainerProfile.rows.set("t1", { ...trainer, stripeAccountId: "acct_1" });
  });

  it("saves the flags and tells the trainer once when payouts switch on", async () => {
    const account = { id: "acct_1", charges_enabled: true, payouts_enabled: true };
    await payments.applyAccountUpdate(account);
    await payments.applyAccountUpdate(account);
    expect(fakeDb.trainerProfile.rows.get("t1")).toMatchObject({ stripeChargesEnabled: true, stripePayoutsEnabled: true });
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "tu1", type: "payouts.active" }));
  });

  it("warns the trainer when Stripe pauses payouts", async () => {
    fakeDb.trainerProfile.rows.get("t1")!.stripeChargesEnabled = true;
    fakeDb.trainerProfile.rows.get("t1")!.stripePayoutsEnabled = true;
    await payments.applyAccountUpdate({ id: "acct_1", charges_enabled: true, payouts_enabled: false });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "payouts.paused" }));
  });

  it("ignores accounts that belong to no trainer", async () => {
    await payments.applyAccountUpdate({ id: "acct_other", charges_enabled: true, payouts_enabled: true });
    expect(fakeDb.trainerProfile.updateMany).not.toHaveBeenCalled();
  });
});

describe("syncRefundedCents", () => {
  it("only ever raises the recorded refund", async () => {
    addBooking({ refundedCents: 2000 });
    expect(await payments.syncRefundedCents("pi_1", 1000)).toBe(0);
    expect(await payments.syncRefundedCents("pi_1", 3000)).toBe(1);
    expect(fakeDb.booking.rows.get("b1")!.refundedCents).toBe(3000);
  });
});
