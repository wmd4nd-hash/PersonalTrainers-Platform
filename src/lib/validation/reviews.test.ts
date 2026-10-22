import { describe, expect, it } from "vitest";
import { adminReviewQuery, parseAdminReviewFilters, replySchema, reviewSchema } from "./reviews";

describe("reviewSchema", () => {
  it("accepts a rating with an optional comment", () => {
    expect(reviewSchema.parse({ rating: "4", comment: "  Great session  " })).toEqual({
      rating: 4,
      comment: "Great session",
    });
    expect(reviewSchema.parse({ rating: "5" })).toEqual({ rating: 5, comment: "" });
  });

  it("rejects missing or out-of-range ratings", () => {
    for (const rating of [undefined, "", "0", "6", "3.5", "abc"]) {
      const r = reviewSchema.safeParse({ rating, comment: "" });
      expect(r.success, `rating ${rating}`).toBe(false);
    }
  });

  it("limits comments to 1000 characters", () => {
    expect(reviewSchema.safeParse({ rating: "5", comment: "a".repeat(1000) }).success).toBe(true);
    expect(reviewSchema.safeParse({ rating: "5", comment: "a".repeat(1001) }).success).toBe(false);
  });
});

describe("replySchema", () => {
  it("needs some text, up to 1000 characters", () => {
    expect(replySchema.parse({ reply: " Thanks! " })).toEqual({ reply: "Thanks!" });
    expect(replySchema.safeParse({ reply: "   " }).success).toBe(false);
    expect(replySchema.safeParse({ reply: "a".repeat(1001) }).success).toBe(false);
  });
});

describe("admin review filters", () => {
  it("parses known filters", () => {
    expect(parseAdminReviewFilters({ show: "hidden", rating: "2", page: "3" })).toEqual({
      visibility: "hidden",
      rating: 2,
      page: 3,
    });
  });

  it("falls back to defaults for anything unexpected", () => {
    expect(parseAdminReviewFilters({ show: "deleted", rating: "9", page: "-1" })).toEqual({
      visibility: "all",
      rating: null,
      page: 1,
    });
  });

  it("builds short query strings", () => {
    expect(adminReviewQuery({ visibility: "all", rating: null, page: 1 })).toBe("");
    expect(adminReviewQuery({ visibility: "visible", rating: 5, page: 1 }, 2)).toBe("?show=visible&rating=5&page=2");
  });
});
