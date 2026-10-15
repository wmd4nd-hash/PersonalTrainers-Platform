import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyToCents } from "./money";

describe("parseMoneyToCents", () => {
  it.each([
    ["45", 4500],
    ["45.5", 4550],
    ["45.05", 4505],
    [" 0.99 ", 99],
  ])("parses %s", (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-5", "1.234", "1,000"])("rejects %s", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats cents in the given currency", () => {
    expect(formatMoney(6500, "gbp")).toBe("£65.00");
    expect(formatMoney(8000, "usd")).toBe("$80.00");
  });
});
