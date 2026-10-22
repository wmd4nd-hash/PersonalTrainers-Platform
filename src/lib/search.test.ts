import { describe, expect, it } from "vitest";
import {
  activeFilters,
  buildTrainerQuery,
  DEFAULT_SEARCH,
  describeCount,
  paginate,
  planGroupReads,
  searchParamsOf,
  tagLabel,
  trainerSearchOrder,
  trainerSearchWhere,
  trainersHref,
  visibleTrainerWhere,
  type TrainerSearch,
} from "./search";

const search = (overrides: Partial<TrainerSearch> = {}): TrainerSearch => ({ ...DEFAULT_SEARCH, ...overrides });

describe("trainerSearchWhere", () => {
  it("only ever returns visible trainers", () => {
    expect(trainerSearchWhere(search())).toEqual({ AND: [visibleTrainerWhere] });
  });

  it("matches the text query against name, headline and specialties", () => {
    const where = trainerSearchWhere(search({ q: "Strength" }));
    expect(where.AND).toContainEqual({
      OR: [
        { user: { name: { contains: "Strength", mode: "insensitive" } } },
        { headline: { contains: "Strength", mode: "insensitive" } },
        { specialties: { has: "strength" } },
      ],
    });
  });

  it("lets a multi-word query match any single specialty", () => {
    const where = trainerSearchWhere(search({ q: "strength coach" }));
    const text = (where.AND as object[])[1] as { OR: object[] };
    expect(text.OR).toContainEqual({ specialties: { hasSome: ["strength", "coach"] } });
  });

  it("combines every filter", () => {
    const where = trainerSearchWhere(
      search({
        city: "London",
        format: "online",
        maxPriceCents: 7500,
        gender: "non-binary",
        language: "spanish",
        verifiedOnly: true,
        minRating: 4.5,
      }),
    );
    expect(where).toEqual({
      AND: [
        visibleTrainerWhere,
        { city: { contains: "London", mode: "insensitive" } },
        { offersOnline: true },
        { sessionRateCents: { lte: 7500 } },
        { user: { gender: "NON_BINARY" } },
        { languages: { has: "spanish" } },
        { verificationStatus: "VERIFIED" },
        { ratingCount: { gt: 0 }, ratingAverage: { gte: 4.5 } },
      ],
    });
  });

  it("filters in-person trainers", () => {
    expect(trainerSearchWhere(search({ format: "in-person" })).AND).toContainEqual({ offersInPerson: true });
  });
});

describe("trainerSearchOrder", () => {
  it("sorts by price, cheapest first", () => {
    expect(trainerSearchOrder("price")[0]).toEqual({ sessionRateCents: "asc" });
  });

  it("sorts by experience, most first", () => {
    expect(trainerSearchOrder("experience")[0]).toEqual({ yearsExperience: "desc" });
  });

  it("sorts by rating, then number of reviews", () => {
    expect(trainerSearchOrder("rating").slice(0, 2)).toEqual([{ ratingAverage: "desc" }, { ratingCount: "desc" }]);
  });

  it("always ends with the id so paging is stable", () => {
    for (const sort of ["recommended", "rating", "price", "experience"] as const) {
      expect(trainerSearchOrder(sort).at(-1)).toEqual({ id: "asc" });
    }
  });
});

describe("buildTrainerQuery", () => {
  it("puts verified trainers first for the recommended sort", () => {
    const { groups } = buildTrainerQuery(search());
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ AND: [trainerSearchWhere(search()), { verificationStatus: "VERIFIED" }] });
    expect(groups[1]).toEqual({
      AND: [trainerSearchWhere(search()), { verificationStatus: { not: "VERIFIED" } }],
    });
  });

  it("uses one group for other sorts", () => {
    expect(buildTrainerQuery(search({ sort: "price" })).groups).toEqual([trainerSearchWhere(search({ sort: "price" }))]);
  });

  it("uses one group when only verified trainers are shown", () => {
    expect(buildTrainerQuery(search({ verifiedOnly: true })).groups).toHaveLength(1);
  });
});

describe("paginate", () => {
  it("works out the slice for a page", () => {
    expect(paginate(30, 2)).toEqual({ page: 2, pageCount: 3, skip: 12, take: 12 });
  });

  it("clamps pages past the end to the last page", () => {
    expect(paginate(13, 9)).toEqual({ page: 2, pageCount: 2, skip: 12, take: 12 });
  });

  it("has one page when there are no results", () => {
    expect(paginate(0, 3)).toEqual({ page: 1, pageCount: 1, skip: 0, take: 12 });
  });
});

describe("planGroupReads", () => {
  it("reads from one group when the page fits inside it", () => {
    expect(planGroupReads([20, 10], 0, 12)).toEqual([{ group: 0, skip: 0, take: 12 }]);
  });

  it("spans two groups", () => {
    expect(planGroupReads([5, 10], 0, 12)).toEqual([
      { group: 0, skip: 0, take: 5 },
      { group: 1, skip: 0, take: 7 },
    ]);
  });

  it("skips past the first group on later pages", () => {
    expect(planGroupReads([5, 30], 12, 12)).toEqual([{ group: 1, skip: 7, take: 12 }]);
  });

  it("skips empty groups and stops at the end", () => {
    expect(planGroupReads([0, 3], 0, 12)).toEqual([{ group: 1, skip: 0, take: 3 }]);
    expect(planGroupReads([2, 3], 12, 12)).toEqual([]);
  });
});

describe("search URLs", () => {
  it("leaves defaults out", () => {
    expect(searchParamsOf(search()).toString()).toBe("");
    expect(trainersHref(search())).toBe("/trainers");
  });

  it("round-trips every filter", () => {
    const params = searchParamsOf(
      search({ q: "yoga", format: "online", maxPriceCents: 7550, verifiedOnly: true, minRating: 4, sort: "price", page: 2 }),
    );
    expect(params.toString()).toBe("q=yoga&format=online&maxPrice=75.50&verified=1&minRating=4&sort=price&page=2");
  });

  it("resets to the first page when the search changes", () => {
    expect(trainersHref(search({ q: "yoga", page: 3 }), { sort: "rating" })).toBe("/trainers?q=yoga&sort=rating");
    expect(trainersHref(search({ q: "yoga" }), { page: 2 })).toBe("/trainers?q=yoga&page=2");
  });
});

describe("activeFilters", () => {
  it("has a chip per filter that links to the search without it", () => {
    const chips = activeFilters(
      search({ city: "Berlin", language: "spanish", verifiedOnly: true, maxPriceCents: 8000, sort: "price", page: 2 }),
    );
    expect(chips.map((c) => c.label)).toEqual(["In Berlin", "Up to 80 a session", "Speaks Spanish", "Verified only"]);
    expect(chips[0].href).toBe("/trainers?maxPrice=80&language=spanish&verified=1&sort=price");
    expect(chips[3].href).toBe("/trainers?city=Berlin&maxPrice=80&language=spanish&sort=price");
  });

  it("is empty without filters", () => {
    expect(activeFilters(search({ sort: "rating" }))).toEqual([]);
  });
});

describe("labels", () => {
  it("capitalises tags and keeps acronyms", () => {
    expect(tagLabel("post-natal")).toBe("Post-natal");
    expect(tagLabel("hiit")).toBe("HIIT");
  });

  it("describes result counts", () => {
    expect(describeCount(0)).toBe("No trainers found");
    expect(describeCount(1)).toBe("1 trainer");
    expect(describeCount(14)).toBe("14 trainers");
  });
});
