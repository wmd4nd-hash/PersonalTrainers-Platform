import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: {} }));

const { bookingTabWhere, getBusyPeriods, parseBookingTab, participantWhere } = await import("./bookings");
const { generateSlots } = await import("./scheduling");

type Where = Record<string, unknown>;

/** A stand-in for the Prisma client that records the queries it receives. */
function fakeClient({
  bookings = [],
  timeOff = [],
}: {
  bookings?: { startsAt: Date; endsAt: Date }[];
  timeOff?: { startsAt: Date; endsAt: Date }[];
}) {
  const calls: { model: string; where: Where }[] = [];
  const client = {
    booking: {
      findMany: async ({ where }: { where: Where }) => {
        calls.push({ model: "booking", where });
        return bookings;
      },
    },
    timeOff: {
      findMany: async ({ where }: { where: Where }) => {
        calls.push({ model: "timeOff", where });
        return timeOff;
      },
    },
  };
  return { client: client as unknown as Parameters<typeof getBusyPeriods>[2], calls };
}

const now = new Date("2026-03-02T06:00:00Z");

describe("getBusyPeriods", () => {
  it("includes the trainer's time off alongside bookings", async () => {
    const booking = { startsAt: new Date("2026-03-02T09:00:00Z"), endsAt: new Date("2026-03-02T10:00:00Z") };
    const off = { startsAt: new Date("2026-03-03T00:00:00Z"), endsAt: new Date("2026-03-04T00:00:00Z") };
    const { client, calls } = fakeClient({ bookings: [booking], timeOff: [off] });

    const busy = await getBusyPeriods("trainer-1", now, client);

    expect(busy).toEqual([booking, off]);
    expect(calls.find((c) => c.model === "timeOff")?.where).toEqual({
      trainerId: "trainer-1",
      endsAt: { gt: now },
    });
  });

  it("can leave out the booking being moved", async () => {
    const { client, calls } = fakeClient({});
    await getBusyPeriods("trainer-1", now, client, { excludeBookingId: "booking-1" });
    const where = calls.find((c) => c.model === "booking")?.where as { AND: Where[] };
    expect(where.AND).toContainEqual({ id: { not: "booking-1" } });
  });

  it("makes slots inside time off disappear", async () => {
    const { client } = fakeClient({
      timeOff: [{ startsAt: new Date("2026-03-03T00:00:00Z"), endsAt: new Date("2026-03-04T00:00:00Z") }],
    });
    const busy = await getBusyPeriods("trainer-1", now, client);
    const slots = generateSlots({
      windows: [1, 2, 3].map((dayOfWeek) => ({ dayOfWeek, startMinute: 540, endMinute: 660 })),
      busy,
      timezone: "UTC",
      sessionMinutes: 60,
      now,
      days: 3,
      minNoticeMinutes: 0,
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-03-02T09:00:00.000Z",
      "2026-03-02T10:00:00.000Z",
      "2026-03-04T09:00:00.000Z",
      "2026-03-04T10:00:00.000Z",
    ]);
  });
});

describe("overview tabs", () => {
  it("defaults to upcoming for missing or unknown tabs", () => {
    expect(parseBookingTab(undefined)).toBe("upcoming");
    expect(parseBookingTab("bogus")).toBe("upcoming");
    expect(parseBookingTab(["past"])).toBe("upcoming");
    expect(parseBookingTab("cancelled")).toBe("cancelled");
  });

  it("scopes bookings to the signed-in side", () => {
    expect(participantWhere({ id: "u1", role: "TRAINER" })).toEqual({ trainer: { userId: "u1" } });
    expect(participantWhere({ id: "u2", role: "CLIENT" })).toEqual({ clientId: "u2" });
  });

  it("hides unpaid bookings from trainers' upcoming list", () => {
    expect(bookingTabWhere("upcoming", "TRAINER", now)).toEqual({ endsAt: { gt: now }, status: "CONFIRMED" });
    expect(bookingTabWhere("upcoming", "CLIENT", now)).toEqual({
      endsAt: { gt: now },
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
    });
  });

  it("lists ended sessions as past and cancellations separately", () => {
    expect(bookingTabWhere("past", "CLIENT", now)).toEqual({
      endsAt: { lte: now },
      status: { in: ["CONFIRMED", "COMPLETED"] },
    });
    expect(bookingTabWhere("cancelled", "TRAINER", now)).toEqual({ status: "CANCELLED" });
  });
});
