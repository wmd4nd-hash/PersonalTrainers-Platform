import { describe, expect, it } from "vitest";
import {
  describeAnswers,
  matchCandidatesWhere,
  matchHref,
  rankMatches,
  scoreMatch,
  timesOfDay,
  type MatchAnswers,
  type MatchCandidate,
} from "./matching";
import { visibleTrainerWhere } from "./search";

function trainer(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: "t1",
    headline: "",
    specialties: [],
    languages: ["english"],
    city: "",
    offersInPerson: false,
    offersOnline: true,
    sessionRateCents: 6000,
    verified: false,
    ratingAverage: 0,
    ratingCount: 0,
    yearsExperience: 0,
    timezone: "UTC",
    ...overrides,
  };
}

const answers = (overrides: Partial<MatchAnswers> = {}): MatchAnswers => ({ format: "either", ...overrides });

// Monday 2026-03-02 06:00 UTC
const now = new Date("2026-03-02T06:00:00Z");

describe("matchCandidatesWhere", () => {
  it("requires online sessions for online clients", () => {
    expect(matchCandidatesWhere(answers({ format: "online" }))).toEqual({
      AND: [visibleTrainerWhere, { offersOnline: true }],
    });
  });

  it("requires in-person sessions in the client's city", () => {
    expect(matchCandidatesWhere(answers({ format: "in-person", city: "Lisbon" }))).toEqual({
      AND: [visibleTrainerWhere, { offersInPerson: true, city: { contains: "Lisbon", mode: "insensitive" } }],
    });
  });

  it("accepts online or local trainers when either works", () => {
    expect(matchCandidatesWhere(answers({ city: "Lisbon" })).AND).toContainEqual({
      OR: [{ offersOnline: true }, { offersInPerson: true, city: { contains: "Lisbon", mode: "insensitive" } }],
    });
    expect(matchCandidatesWhere(answers())).toEqual({ AND: [visibleTrainerWhere] });
  });

  it("respects a gender preference", () => {
    expect(matchCandidatesWhere(answers({ gender: "female" })).AND).toContainEqual({ user: { gender: "FEMALE" } });
  });
});

describe("timesOfDay", () => {
  it("tags mornings and evenings in the given timezone", () => {
    // 10:00 UTC is 05:00 in New York (EST, UTC-5).
    expect(timesOfDay(new Date("2026-03-03T10:00:00Z"), "America/New_York")).toEqual(["mornings"]);
    expect(timesOfDay(new Date("2026-03-03T18:00:00Z"), "UTC")).toEqual(["evenings"]);
    expect(timesOfDay(new Date("2026-03-03T14:00:00Z"), "UTC")).toEqual([]);
  });

  it("tags weekends, including weekend mornings", () => {
    // Saturday 2026-03-07
    expect(timesOfDay(new Date("2026-03-07T09:00:00Z"), "UTC")).toEqual(["mornings", "weekends"]);
  });
});

describe("scoreMatch", () => {
  it("explains a strong match in plain words, strongest reason first", () => {
    const result = scoreMatch(
      trainer({ specialties: ["running"], languages: ["english", "spanish"], sessionRateCents: 8000 }),
      answers({ goal: "running", language: "spanish", budgetCents: 10000 }),
    );
    expect(result.reasons).toEqual(["Specialises in running", "Speaks Spanish", "Within your budget"]);
    expect(result.caveats).toEqual([]);
  });

  it("gives at most three reasons", () => {
    const result = scoreMatch(
      trainer({
        specialties: ["running"],
        languages: ["spanish"],
        verified: true,
        ratingAverage: 4.9,
        ratingCount: 12,
        yearsExperience: 12,
      }),
      answers({ goal: "running", language: "spanish", budgetCents: 10000 }),
    );
    expect(result.reasons).toHaveLength(3);
  });

  it("mentions reviews and verification when there's nothing more specific", () => {
    const result = scoreMatch(trainer({ verified: true, ratingAverage: 4.9, ratingCount: 12 }), answers());
    expect(result.reasons.slice(0, 2)).toEqual(["4.9 from 12 reviews", "Verified trainer"]);
  });

  it("notes where a trainer falls short", () => {
    const result = scoreMatch(
      trainer({ sessionRateCents: 12000 }),
      answers({ language: "spanish", budgetCents: 8000 }),
    );
    expect(result.caveats).toEqual(["Doesn't list Spanish", "Above your budget"]);
    expect(result.score).toBeLessThan(0);
  });

  it("counts open times in the client's preferred time of day", () => {
    const morning = new Date("2026-03-03T08:00:00Z");
    const evening = new Date("2026-03-03T18:00:00Z");
    const result = scoreMatch(trainer(), answers({ time: "mornings", timezone: "UTC" }), { slots: [morning, evening], now });
    expect(result.reasons).toContain("Free mornings this week");

    const later = scoreMatch(trainer(), answers({ time: "mornings", timezone: "UTC" }), {
      slots: [new Date("2026-03-11T08:00:00Z")],
      now,
    });
    expect(later.reasons).toContain("Free mornings in the next two weeks");

    const none = scoreMatch(trainer(), answers({ time: "mornings", timezone: "UTC" }), { slots: [evening], now });
    expect(none.caveats).toEqual(["No free mornings in the next two weeks"]);
  });

  it("uses the trainer's timezone when the client's is unknown", () => {
    // 13:00 UTC is 09:00 in New York once daylight saving starts (EDT, UTC-4).
    const slot = new Date("2026-03-10T13:00:00Z");
    const result = scoreMatch(trainer({ timezone: "America/New_York" }), answers({ time: "mornings" }), {
      slots: [slot],
      now,
    });
    expect(result.reasons).toContain("Free mornings in the next two weeks");
  });

  it("prefers trainers who can meet in the client's city", () => {
    const local = scoreMatch(trainer({ city: "Lisbon", offersInPerson: true }), answers({ city: "lisbon" }));
    const remote = scoreMatch(trainer(), answers({ city: "lisbon" }));
    expect(local.reasons).toContain("Trains in person in Lisbon");
    expect(remote.reasons).toContain("Offers online sessions");
    expect(local.score).toBeGreaterThan(remote.score);
  });

  it("weighs few reviews less than many", () => {
    const one = scoreMatch(trainer({ ratingAverage: 5, ratingCount: 1 }), answers());
    const many = scoreMatch(trainer({ ratingAverage: 4.8, ratingCount: 40 }), answers());
    expect(many.score).toBeGreaterThan(one.score);
  });
});

describe("rankMatches", () => {
  it("ranks by score and keeps the top five", () => {
    const trainers = [
      trainer({ id: "a" }),
      trainer({ id: "b", specialties: ["running"] }),
      trainer({ id: "c", specialties: ["running"], languages: ["spanish"] }),
      ...["d", "e", "f", "g"].map((id) => trainer({ id })),
    ];
    const ranked = rankMatches(trainers, answers({ goal: "running", language: "spanish" }));
    expect(ranked).toHaveLength(5);
    expect(ranked.slice(0, 2).map((m) => m.trainer.id)).toEqual(["c", "b"]);
  });

  it("breaks ties by rating, then experience, then id", () => {
    const ranked = rankMatches(
      [
        trainer({ id: "z" }),
        trainer({ id: "y", yearsExperience: 1 }),
        trainer({ id: "x" }),
      ],
      answers(),
      undefined,
      3,
    );
    // y scores slightly higher from experience; x and z tie and fall back to id.
    expect(ranked.map((m) => m.trainer.id)).toEqual(["y", "x", "z"]);
  });

  it("uses availability when given", () => {
    const busy = trainer({ id: "busy", ratingAverage: 5, ratingCount: 10 });
    const free = trainer({ id: "free" });
    const ranked = rankMatches([busy, free], answers({ time: "evenings", timezone: "UTC" }), (t) => ({
      slots: t.id === "free" ? [new Date("2026-03-03T18:00:00Z")] : [],
      now,
    }));
    expect(ranked[0].trainer.id).toBe("free");
    expect(ranked[0].reasons).toContain("Free evenings this week");
  });
});

describe("answers in URLs", () => {
  it("builds shareable links and leaves defaults out", () => {
    expect(matchHref("/match/results", answers())).toBe("/match/results");
    expect(
      matchHref("/match", answers({ goal: "weight loss", format: "online", budgetCents: 7500, time: "mornings" }), { step: "3" }),
    ).toBe("/match?goal=weight+loss&format=online&budget=75&time=mornings&step=3");
  });

  it("summarises the answers", () => {
    expect(
      describeAnswers(answers({ goal: "hiit", format: "in-person", city: "Dubai", budgetCents: 10000, gender: "male", language: "arabic" })),
    ).toEqual(["HIIT", "In person in Dubai", "Up to 100 a session", "Male trainer", "Speaks Arabic"]);
  });
});
