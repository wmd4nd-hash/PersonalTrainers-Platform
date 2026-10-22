import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./db", () => ({ db: {} }));

const { mergeMoneyTotals, startOfUtcMonth } = await import("./admin-stats");

describe("startOfUtcMonth", () => {
  it("returns midnight UTC on the first of the month", () => {
    expect(startOfUtcMonth(new Date("2026-10-22T15:30:00Z"))).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(startOfUtcMonth(new Date("2026-01-01T00:00:00Z"))).toEqual(new Date("2026-01-01T00:00:00Z"));
  });
});

describe("mergeMoneyTotals", () => {
  it("adds amounts per currency without mixing currencies", () => {
    expect(
      mergeMoneyTotals(
        [
          { currency: "usd", cents: 8000 },
          { currency: "gbp", cents: 6500 },
        ],
        [
          { currency: "usd", cents: 30000 },
          { currency: "eur", cents: 0 },
        ],
      ),
    ).toEqual([
      { currency: "usd", cents: 38000 },
      { currency: "gbp", cents: 6500 },
    ]);
  });

  it("returns nothing when there is nothing to add", () => {
    expect(mergeMoneyTotals([], [])).toEqual([]);
  });
});
