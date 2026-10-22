import { describe, expect, it } from "vitest";
import {
  entryVolume,
  estimateOneRepMax,
  exerciseKey,
  formatKg,
  formatRelativeDay,
  personalBests,
  repsLowerBound,
  startOfWeekIn,
  weeklyCounts,
  weeklyStreak,
  workoutsThisWeek,
  workoutVolume,
  type LoggedExercise,
} from "./progress";

const d = (iso: string) => new Date(iso);

describe("repsLowerBound", () => {
  it("uses the lower bound of a range", () => {
    expect(repsLowerBound("8-12")).toBe(8);
    expect(repsLowerBound("8–12")).toBe(8);
    expect(repsLowerBound(" 10 ")).toBe(10);
    expect(repsLowerBound("5x5")).toBe(5);
    expect(repsLowerBound("12 reps")).toBe(12);
    expect(repsLowerBound("10 each side")).toBe(10);
  });
  it("returns null when there is no positive number", () => {
    expect(repsLowerBound("AMRAP")).toBeNull();
    expect(repsLowerBound("")).toBeNull();
    expect(repsLowerBound("0")).toBeNull();
  });
  it("doesn't count time or distance as reps", () => {
    expect(repsLowerBound("30s")).toBeNull();
    expect(repsLowerBound("40m")).toBeNull();
    expect(repsLowerBound("1 min")).toBeNull();
    expect(repsLowerBound("400 metres")).toBeNull();
  });
});

describe("estimateOneRepMax", () => {
  it("applies the Epley formula", () => {
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.333, 3);
    expect(estimateOneRepMax(42.5, 5)).toBeCloseTo(49.583, 3);
  });
  it("treats a single rep as the max itself", () => {
    expect(estimateOneRepMax(120, 1)).toBe(120);
  });
  it("ignores missing weight or reps", () => {
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(50, 0)).toBeNull();
  });
});

describe("volume", () => {
  it("multiplies sets, the lower rep bound and weight", () => {
    expect(entryVolume({ setsDone: 3, reps: "8-12", weightKg: 20 })).toBe(480);
    expect(entryVolume({ setsDone: 3, reps: "10", weightKg: 42.5 })).toBe(1275);
  });
  it("is zero without a weight or countable reps", () => {
    expect(entryVolume({ setsDone: 3, reps: "10", weightKg: null })).toBe(0);
    expect(entryVolume({ setsDone: 3, reps: "AMRAP", weightKg: 20 })).toBe(0);
    expect(entryVolume({ setsDone: 0, reps: "10", weightKg: 20 })).toBe(0);
  });
  it("adds up a workout", () => {
    expect(
      workoutVolume([
        { setsDone: 3, reps: "8-12", weightKg: 20 },
        { setsDone: 2, reps: "5", weightKg: 50 },
        { setsDone: 3, reps: "30s", weightKg: null },
      ]),
    ).toBe(980);
  });
});

describe("weeks", () => {
  // Thursday 22 October 2026, 12:00 UTC.
  const now = d("2026-10-22T12:00:00Z");

  it("starts weeks on Monday in the given timezone", () => {
    expect(startOfWeekIn(now).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    // Monday 00:00 in Tokyo is Sunday 15:00 UTC.
    expect(startOfWeekIn(now, "Asia/Tokyo").toISOString()).toBe("2026-10-18T15:00:00.000Z");
  });

  it("counts workouts this week", () => {
    const dates = [d("2026-10-19T07:00:00Z"), d("2026-10-21T18:00:00Z"), d("2026-10-18T20:00:00Z")];
    expect(workoutsThisWeek(dates, now)).toBe(2);
  });

  it("puts a late Sunday workout in the next week for timezones ahead of UTC", () => {
    // Sunday 23:30 UTC is Monday morning in Tokyo.
    const dates = [d("2026-10-18T23:30:00Z")];
    expect(workoutsThisWeek(dates, now, "UTC")).toBe(0);
    expect(workoutsThisWeek(dates, now, "Asia/Tokyo")).toBe(1);
  });

  it("returns weekly counts oldest first, including empty weeks", () => {
    const dates = [d("2026-10-20T10:00:00Z"), d("2026-10-06T10:00:00Z"), d("2026-10-07T10:00:00Z")];
    expect(weeklyCounts(dates, now, "UTC", 4).map((w) => w.count)).toEqual([0, 2, 0, 1]);
    expect(weeklyCounts(dates, now, "UTC", 4)[0].weekStart.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("keeps whole weeks across a daylight saving change", () => {
    // Clocks go back in London on 25 October 2026.
    const later = d("2026-11-04T12:00:00Z");
    const weeks = weeklyCounts([], later, "Europe/London", 3).map((w) => w.weekStart.toISOString());
    expect(weeks).toEqual([
      "2026-10-18T23:00:00.000Z",
      "2026-10-26T00:00:00.000Z",
      "2026-11-02T00:00:00.000Z",
    ]);
  });
});

describe("weeklyStreak", () => {
  const now = d("2026-10-22T12:00:00Z");

  it("counts consecutive weeks up to this week", () => {
    const dates = [d("2026-10-20T10:00:00Z"), d("2026-10-14T10:00:00Z"), d("2026-10-05T10:00:00Z")];
    expect(weeklyStreak(dates, now)).toBe(3);
  });

  it("keeps the streak alive while this week has no workout yet", () => {
    const dates = [d("2026-10-14T10:00:00Z"), d("2026-10-06T10:00:00Z")];
    expect(weeklyStreak(dates, now)).toBe(2);
  });

  it("breaks on a week without workouts", () => {
    const dates = [d("2026-10-20T10:00:00Z"), d("2026-10-06T10:00:00Z")];
    expect(weeklyStreak(dates, now)).toBe(1);
  });

  it("is zero with no recent workouts", () => {
    expect(weeklyStreak([], now)).toBe(0);
    expect(weeklyStreak([d("2026-10-01T10:00:00Z")], now)).toBe(0);
  });

  it("uses the client's timezone", () => {
    // Monday 01:00 in Tokyo, still Sunday in UTC: in UTC both workouts share a week.
    const dates = [d("2026-10-18T16:00:00Z"), d("2026-10-12T10:00:00Z")];
    expect(weeklyStreak(dates, now, "UTC")).toBe(1);
    expect(weeklyStreak(dates, now, "Asia/Tokyo")).toBe(2);
    expect(weeklyStreak([d("2026-10-18T16:00:00Z"), d("2026-10-05T10:00:00Z")], now, "Asia/Tokyo")).toBe(1);
  });
});

describe("personalBests", () => {
  const entry = (name: string, iso: string, weightKg: number | null, reps = "5", setsDone = 3): LoggedExercise => ({
    exerciseName: name,
    completedAt: d(iso),
    setsDone,
    reps,
    weightKg,
  });

  it("finds the heaviest weight and best estimated 1RM per exercise", () => {
    const [squat] = personalBests([
      entry("Back squat", "2026-10-01T10:00:00Z", 60, "8"),
      entry("Back squat", "2026-10-08T10:00:00Z", 70, "3"),
      entry("Back squat", "2026-10-15T10:00:00Z", 65, "8"),
    ]);
    expect(squat.maxWeightKg).toBe(70);
    expect(squat.maxWeightOn).toEqual(d("2026-10-08T10:00:00Z"));
    // 65 × (1 + 8/30) = 82.33 beats 70 × (1 + 3/30) = 77.
    expect(squat.bestOneRepMaxKg).toBeCloseTo(82.333, 3);
    expect(squat.bestOneRepMaxOn).toEqual(d("2026-10-15T10:00:00Z"));
    expect(squat.history.map((h) => h.weightKg)).toEqual([60, 70, 65]);
  });

  it("groups names case- and space-insensitively and keeps the first date a best was hit", () => {
    const bests = personalBests([
      entry("Deadlift", "2026-10-01T10:00:00Z", 100),
      entry(" deadlift ", "2026-10-08T10:00:00Z", 100),
    ]);
    expect(bests).toHaveLength(1);
    expect(bests[0].maxWeightOn).toEqual(d("2026-10-01T10:00:00Z"));
    expect(exerciseKey("Back  Squat ")).toBe("back squat");
  });

  it("ignores bodyweight and skipped entries", () => {
    expect(
      personalBests([
        entry("Push-up", "2026-10-01T10:00:00Z", null, "12"),
        entry("Row", "2026-10-01T10:00:00Z", 40, "10", 0),
      ]),
    ).toEqual([]);
  });

  it("keeps the max weight but no 1RM when reps aren't countable", () => {
    const [carry] = personalBests([entry("Farmer's carry", "2026-10-01T10:00:00Z", 24, "40m")]);
    expect(carry.maxWeightKg).toBe(24);
    expect(carry.bestOneRepMaxKg).toBeNull();
    const [dips] = personalBests([entry("Dips", "2026-10-01T10:00:00Z", 10, "AMRAP")]);
    expect(dips.bestOneRepMaxKg).toBeNull();
  });

  it("charts the heaviest set of each session and sorts by most recent exercise", () => {
    const bests = personalBests([
      entry("Row", "2026-10-01T10:00:00Z", 30),
      entry("Row", "2026-10-01T10:00:00Z", 35),
      entry("Press", "2026-10-05T10:00:00Z", 20),
    ]);
    expect(bests.map((b) => b.name)).toEqual(["Press", "Row"]);
    expect(bests[1].history).toEqual([{ date: d("2026-10-01T10:00:00Z"), weightKg: 35 }]);
  });
});

describe("formatting", () => {
  it("formats kilograms", () => {
    expect(formatKg(42.5)).toBe("42.5 kg");
    expect(formatKg(40)).toBe("40 kg");
    expect(formatKg(49.5833)).toBe("49.6 kg");
  });

  it("describes recent days relative to now", () => {
    const now = d("2026-10-22T12:00:00Z");
    expect(formatRelativeDay(d("2026-10-22T06:00:00Z"), now)).toBe("today");
    expect(formatRelativeDay(d("2026-10-21T23:00:00Z"), now)).toBe("yesterday");
    expect(formatRelativeDay(d("2026-10-19T10:00:00Z"), now)).toBe("3 days ago");
    expect(formatRelativeDay(d("2026-10-01T10:00:00Z"), now)).toBe("Oct 1");
    // 23:00 UTC on the 21st is already the 22nd in Tokyo.
    expect(formatRelativeDay(d("2026-10-21T23:00:00Z"), now, "Asia/Tokyo")).toBe("today");
  });
});
