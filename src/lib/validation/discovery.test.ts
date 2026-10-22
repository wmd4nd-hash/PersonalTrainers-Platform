import { describe, expect, it } from "vitest";
import { parseMatchAnswers, parseQuizStep, parseTrainerSearch } from "./discovery";

describe("parseTrainerSearch", () => {
  it("defaults to the first page of recommended trainers", () => {
    expect(parseTrainerSearch({})).toEqual({ verifiedOnly: false, sort: "recommended", page: 1 });
  });

  it("reads every filter", () => {
    expect(
      parseTrainerSearch({
        q: "  strength ",
        city: "London",
        format: "online",
        maxPrice: "79.50",
        gender: "female",
        language: "Spanish",
        verified: "1",
        minRating: "4.5",
        sort: "price",
        page: "3",
      }),
    ).toEqual({
      q: "strength",
      city: "London",
      format: "online",
      maxPriceCents: 7950,
      gender: "female",
      language: "spanish",
      verifiedOnly: true,
      minRating: 4.5,
      sort: "price",
      page: 3,
    });
  });

  it("drops values it doesn't understand instead of failing", () => {
    expect(
      parseTrainerSearch({
        q: "",
        format: "carrier-pigeon",
        maxPrice: "cheap",
        gender: "robot",
        minRating: "2",
        sort: "random",
        page: "-4",
      }),
    ).toEqual({ verifiedOnly: false, sort: "recommended", page: 1 });
  });

  it("uses the first value when a param repeats", () => {
    expect(parseTrainerSearch({ city: ["Berlin", "Paris"] }).city).toBe("Berlin");
  });
});

describe("parseMatchAnswers", () => {
  it("reads the quiz answers", () => {
    expect(
      parseMatchAnswers({
        goal: "Running",
        format: "in-person",
        city: "New York",
        budget: "100",
        gender: "male",
        language: "spanish",
        time: "mornings",
        tz: "America/New_York",
      }),
    ).toEqual({
      goal: "running",
      format: "in-person",
      city: "New York",
      budgetCents: 10000,
      gender: "male",
      language: "spanish",
      time: "mornings",
      timezone: "America/New_York",
    });
  });

  it("ignores the city for online sessions", () => {
    expect(parseMatchAnswers({ format: "online", city: "Paris" }).city).toBeUndefined();
  });

  it("falls back to sensible defaults", () => {
    expect(
      parseMatchAnswers({ format: "teleport", budget: "33", time: "noon", tz: "Mars/Olympus", gender: "any" }),
    ).toEqual({ format: "either", budgetCents: undefined, timezone: undefined });
  });
});

describe("parseQuizStep", () => {
  it("accepts steps 1 to 4 and defaults to 1", () => {
    expect(parseQuizStep({ step: "3" })).toBe(3);
    expect(parseQuizStep({ step: "9" })).toBe(1);
    expect(parseQuizStep({})).toBe(1);
  });
});
