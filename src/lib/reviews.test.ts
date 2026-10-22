import { describe, expect, it } from "vitest";
import {
  averageRating,
  formatReviewDate,
  isValidRating,
  paginate,
  parsePage,
  ratingLabel,
  reviewCountLabel,
  reviewDeadline,
  reviewEligibility,
  reviewerName,
  summarizeRatings,
} from "./reviews";

describe("reviewEligibility", () => {
  const endsAt = new Date("2026-03-10T11:00:00Z");
  const booking = { clientId: "client-1", status: "COMPLETED", endsAt, hasReview: false };
  const soon = new Date("2026-03-11T09:00:00Z");

  it("lets the client review a completed session", () => {
    expect(reviewEligibility(booking, "client-1", soon)).toEqual({
      eligible: true,
      deadline: new Date("2026-05-09T11:00:00Z"),
    });
  });

  it("only lets the booking's own client review it", () => {
    const r = reviewEligibility(booking, "someone-else", soon);
    expect(r).toMatchObject({ eligible: false, reason: "not-your-booking" });
  });

  it("allows one review per booking", () => {
    const r = reviewEligibility({ ...booking, hasReview: true }, "client-1", soon);
    expect(r).toMatchObject({ eligible: false, reason: "already-reviewed" });
  });

  it("requires the session to be completed", () => {
    for (const status of ["PENDING_PAYMENT", "CONFIRMED", "CANCELLED"]) {
      const r = reviewEligibility({ ...booking, status }, "client-1", soon);
      expect(r).toMatchObject({ eligible: false, reason: "not-completed" });
    }
  });

  it("closes 60 days after the session ends", () => {
    const lastMoment = new Date("2026-05-09T11:00:00Z");
    expect(reviewEligibility(booking, "client-1", lastMoment).eligible).toBe(true);
    const tooLate = new Date("2026-05-09T11:00:01Z");
    expect(reviewEligibility(booking, "client-1", tooLate)).toMatchObject({
      eligible: false,
      reason: "window-closed",
    });
  });

  it("reports an existing review even after the window closes", () => {
    const r = reviewEligibility({ ...booking, hasReview: true }, "client-1", new Date("2027-01-01T00:00:00Z"));
    expect(r).toMatchObject({ eligible: false, reason: "already-reviewed" });
  });

  it("works out the deadline from the session end", () => {
    expect(reviewDeadline(endsAt)).toEqual(new Date("2026-05-09T11:00:00Z"));
  });
});

describe("ratings", () => {
  it("accepts whole stars from 1 to 5", () => {
    expect([1, 2, 3, 4, 5].every(isValidRating)).toBe(true);
    expect([0, 6, 4.5, -1, Number.NaN].some(isValidRating)).toBe(false);
  });

  it("labels ratings in plain words", () => {
    expect(ratingLabel(5)).toBe("Excellent");
    expect(ratingLabel(1)).toBe("Poor");
    expect(ratingLabel(9)).toBe("");
  });

  it("rounds the average to two decimals", () => {
    expect(averageRating(14, 3)).toBe(4.67);
    expect(averageRating(10, 2)).toBe(5);
    expect(averageRating(0, 0)).toBe(0);
  });
});

describe("summarizeRatings", () => {
  it("builds the average and a 5-to-1 distribution", () => {
    const s = summarizeRatings([
      { rating: 5, count: 3 },
      { rating: 4, count: 1 },
      { rating: 2, count: 1 },
    ]);
    expect(s.count).toBe(5);
    expect(s.average).toBe(4.2);
    expect(s.distribution).toEqual([
      { rating: 5, count: 3, percent: 60 },
      { rating: 4, count: 1, percent: 20 },
      { rating: 3, count: 0, percent: 0 },
      { rating: 2, count: 1, percent: 20 },
      { rating: 1, count: 0, percent: 0 },
    ]);
  });

  it("handles no reviews", () => {
    const s = summarizeRatings([]);
    expect(s).toMatchObject({ average: 0, count: 0 });
    expect(s.distribution.map((d) => d.percent)).toEqual([0, 0, 0, 0, 0]);
  });

  it("ignores out-of-range ratings", () => {
    expect(summarizeRatings([{ rating: 7, count: 2 }, { rating: 3, count: 1 }])).toMatchObject({ average: 3, count: 1 });
  });
});

describe("labels", () => {
  it("pluralises review counts", () => {
    expect(reviewCountLabel(0)).toBe("0 reviews");
    expect(reviewCountLabel(1)).toBe("1 review");
    expect(reviewCountLabel(12)).toBe("12 reviews");
  });

  it("formats review dates in the trainer's timezone", () => {
    const lateEvening = new Date("2026-03-10T23:30:00Z");
    expect(formatReviewDate(lateEvening, "UTC")).toBe("Mar 10, 2026");
    expect(formatReviewDate(lateEvening, "Asia/Tokyo")).toBe("Mar 11, 2026");
  });
});

describe("reviewerName", () => {
  it("shows first name and last initial", () => {
    expect(reviewerName("Priya Shah")).toBe("Priya S.");
    expect(reviewerName("  Ana  María de la cruz ")).toBe("Ana C.");
  });
  it("keeps single names as they are", () => {
    expect(reviewerName("Cher")).toBe("Cher");
    expect(reviewerName("   ")).toBe("Client");
  });
});

describe("pagination", () => {
  it("parses page numbers from search params", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["2", "5"])).toBe(2);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
  });

  it("works out skip and take", () => {
    expect(paginate(25, 2, 10)).toEqual({
      page: 2,
      pageCount: 3,
      skip: 10,
      take: 10,
      hasPrevious: true,
      hasNext: true,
    });
  });

  it("clamps pages past the end and handles empty lists", () => {
    expect(paginate(25, 9, 10)).toMatchObject({ page: 3, skip: 20, hasNext: false });
    expect(paginate(0, 4, 10)).toMatchObject({ page: 1, pageCount: 1, skip: 0, hasPrevious: false, hasNext: false });
  });
});
