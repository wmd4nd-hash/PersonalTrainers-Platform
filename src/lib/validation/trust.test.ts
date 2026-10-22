import { describe, expect, it } from "vitest";
import {
  documentReviewSchema,
  documentUploadSchema,
  pageCount,
  parseBookingFilters,
  parseDay,
  parseUserFilters,
} from "./trust";

describe("parseDay", () => {
  it("parses real calendar days as UTC midnight", () => {
    expect(parseDay("2026-10-22")).toEqual(new Date("2026-10-22T00:00:00Z"));
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("22/10/2026")).toBeNull();
    expect(parseDay("")).toBeNull();
  });
});

describe("documentUploadSchema", () => {
  it("accepts a kind with an optional expiry date", () => {
    expect(documentUploadSchema.parse({ kind: "INSURANCE", expiresOn: "2027-03-31" })).toEqual({
      kind: "INSURANCE",
      expiresOn: new Date("2027-03-31T00:00:00Z"),
    });
    expect(documentUploadSchema.parse({ kind: "CERTIFICATION", expiresOn: "" }).expiresOn).toBeNull();
  });

  it("rejects unknown kinds and bad dates", () => {
    expect(documentUploadSchema.safeParse({ kind: "PASSPORT" }).success).toBe(false);
    expect(documentUploadSchema.safeParse({ kind: "OTHER", expiresOn: "soon" }).success).toBe(false);
  });
});

describe("documentReviewSchema", () => {
  it("needs a note when rejecting", () => {
    expect(documentReviewSchema.safeParse({ decision: "APPROVED" }).success).toBe(true);
    expect(documentReviewSchema.safeParse({ decision: "REJECTED", note: "  " }).success).toBe(false);
    expect(documentReviewSchema.safeParse({ decision: "REJECTED", note: "Blurry scan" }).success).toBe(true);
    expect(documentReviewSchema.safeParse({ decision: "MAYBE" }).success).toBe(false);
  });
});

describe("parseUserFilters", () => {
  it("falls back to defaults instead of failing", () => {
    expect(parseUserFilters({})).toEqual({ q: "", role: undefined, page: 1 });
    expect(parseUserFilters({ q: "  maya ", role: "TRAINER", page: "3" })).toEqual({
      q: "maya",
      role: "TRAINER",
      page: 3,
    });
    expect(parseUserFilters({ role: "ROOT", page: "-2" })).toEqual({ q: "", role: undefined, page: 1 });
    expect(parseUserFilters({ q: ["a", "b"], page: "abc" })).toEqual({ q: "a", role: undefined, page: 1 });
  });
});

describe("parseBookingFilters", () => {
  it("parses status and a date range, swapping a reversed range", () => {
    expect(parseBookingFilters({ status: "CONFIRMED", from: "2026-10-31", to: "2026-10-01" })).toEqual({
      q: "",
      status: "CONFIRMED",
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-31T00:00:00Z"),
      page: 1,
    });
    expect(parseBookingFilters({ status: "LOST", from: "nope" })).toMatchObject({ status: undefined, from: null });
  });
});

describe("pageCount", () => {
  it("always has at least one page", () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
  });
});
