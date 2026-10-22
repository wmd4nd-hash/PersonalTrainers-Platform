import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ bookingCancelled: vi.fn() }));
vi.mock("./packages", () => ({ restoreCredit: vi.fn() }));
vi.mock("./payments", () => {
  class RefundError extends Error {}
  return { RefundError, refundBooking: vi.fn(async (_id: string, cents: number) => cents), expireCheckout: vi.fn() };
});

type Booking = {
  id: string;
  clientId: string;
  status: string;
  startsAt: Date;
  priceCents: number;
  refundedCents: number;
  currency: string;
  packagePurchaseId: string | null;
  stripeCheckoutSessionId: string | null;
  trainer: { userId: string; cancellationWindowHours: number; lateCancelFeePercent: number };
};

let booking: Booking;

// Just enough of Prisma for cancelBookingAs: a lookup scoped to the actor and
// a compare-and-set on the status.
const fakeDb = {
  booking: {
    findFirst: vi.fn(async ({ where }: { where: { id: string; OR?: { clientId?: string; trainer?: { userId: string } }[] } }) => {
      if (where.id !== booking.id || !["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status)) return null;
      if (booking.startsAt <= new Date()) return null;
      const allowed = !where.OR || where.OR.some((w) => w.clientId === booking.clientId || w.trainer?.userId === booking.trainer.userId);
      return allowed ? structuredClone(booking) : null;
    }),
    findUnique: vi.fn(async () => ({ status: booking.status })),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
      if (where.id !== booking.id || where.status !== booking.status) return { count: 0 };
      booking.status = data.status;
      return { count: 1 };
    }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb)),
};
vi.mock("./db", () => ({ db: fakeDb }));

const { cancelBookingAs, cancelBookingWithOutcome } = await import("./booking-lifecycle");
const { refundBooking, expireCheckout, RefundError } = await import("./payments");
const { restoreCredit } = await import("./packages");
const { bookingCancelled } = await import("./events");

const client = { id: "client1", role: "CLIENT" as const };
const trainerUser = { id: "trainerUser1", role: "TRAINER" as const };
const admin = { id: "admin1", role: "ADMIN" as const };

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 3_600_000);
}

beforeEach(() => {
  vi.clearAllMocks();
  booking = {
    id: "b1",
    clientId: client.id,
    status: "CONFIRMED",
    startsAt: hoursFromNow(72),
    priceCents: 6000,
    refundedCents: 0,
    currency: "usd",
    packagePurchaseId: null,
    stripeCheckoutSessionId: "cs_1",
    trainer: { userId: trainerUser.id, cancellationWindowHours: 24, lateCancelFeePercent: 50 },
  };
});

describe("cancelBookingAs", () => {
  it("refunds a card payment in full when the client cancels in time", async () => {
    const result = await cancelBookingWithOutcome(client, "b1", "Can't make it");
    expect(result).toEqual({ ok: true, refundCents: 6000, currency: "usd", late: false, creditRestored: false, refundFailed: false });
    expect(refundBooking).toHaveBeenCalledWith("b1", 6000);
    expect(bookingCancelled).toHaveBeenCalledWith("b1", { refundCents: 6000 });
    expect(booking.status).toBe("CANCELLED");
  });

  it("refunds only once when called twice", async () => {
    expect(await cancelBookingAs(client, "b1")).toBe(true);
    expect(await cancelBookingAs(client, "b1")).toBe(false);
    expect(refundBooking).toHaveBeenCalledOnce();
    expect(bookingCancelled).toHaveBeenCalledOnce();
  });

  it("refunds once when two cancellations race", async () => {
    const results = await Promise.all([cancelBookingAs(client, "b1"), cancelBookingAs(trainerUser, "b1")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(refundBooking).toHaveBeenCalledOnce();
  });

  it("keeps the late fee when the client cancels inside the window", async () => {
    booking.startsAt = hoursFromNow(2);
    const result = await cancelBookingWithOutcome(client, "b1");
    expect(result).toMatchObject({ ok: true, late: true, refundCents: 3000 });
    expect(refundBooking).toHaveBeenCalledWith("b1", 3000);
  });

  it("only refunds what hasn't been refunded already", async () => {
    booking.refundedCents = 1000;
    await cancelBookingAs(client, "b1");
    expect(refundBooking).toHaveBeenCalledWith("b1", 5000);
  });

  it("refunds in full when the trainer or an admin cancels, even at short notice", async () => {
    booking.startsAt = hoursFromNow(1);
    expect(await cancelBookingWithOutcome(trainerUser, "b1")).toMatchObject({ ok: true, late: false, refundCents: 6000 });

    booking.status = "CONFIRMED";
    vi.clearAllMocks();
    expect(await cancelBookingWithOutcome(admin, "b1")).toMatchObject({ ok: true, refundCents: 6000 });
    expect(refundBooking).toHaveBeenCalledWith("b1", 6000);
  });

  it("gives a package session back without refunding money", async () => {
    booking.packagePurchaseId = "pp1";
    const result = await cancelBookingWithOutcome(client, "b1");
    expect(result).toMatchObject({ ok: true, refundCents: 0, creditRestored: true });
    expect(refundBooking).not.toHaveBeenCalled();
    expect(restoreCredit).toHaveBeenCalledWith(fakeDb, "pp1", expect.any(Date));
  });

  it("keeps a package session that is cancelled late with a fee", async () => {
    booking.packagePurchaseId = "pp1";
    booking.startsAt = hoursFromNow(2);
    expect(await cancelBookingWithOutcome(client, "b1")).toMatchObject({ ok: true, late: true, creditRestored: false });
    expect(restoreCredit).not.toHaveBeenCalled();
  });

  it("closes the checkout of an unpaid booking without refunding or notifying", async () => {
    booking.status = "PENDING_PAYMENT";
    expect(await cancelBookingWithOutcome(client, "b1")).toMatchObject({ ok: true, refundCents: 0 });
    expect(expireCheckout).toHaveBeenCalledWith("cs_1");
    expect(refundBooking).not.toHaveBeenCalled();
    expect(bookingCancelled).not.toHaveBeenCalled();
  });

  it("refuses people who aren't on the booking", async () => {
    expect(await cancelBookingAs({ id: "someone", role: "CLIENT" }, "b1")).toBe(false);
    expect(booking.status).toBe("CONFIRMED");
  });

  it("still cancels, and says so, when Stripe refuses the refund", async () => {
    vi.mocked(refundBooking).mockRejectedValueOnce(new RefundError("declined"));
    expect(await cancelBookingWithOutcome(client, "b1")).toMatchObject({ ok: true, refundFailed: true });
    expect(booking.status).toBe("CANCELLED");
    expect(bookingCancelled).toHaveBeenCalled();
  });
});
