import { describe, expect, it } from "vitest";
import { assignProgramSchema, clientNoteSchema, logFieldName, parseWorkoutLog } from "./coaching";

describe("assignProgramSchema", () => {
  it("makes the start date optional", () => {
    expect(assignProgramSchema.parse({ clientId: "c1", startsOn: "" }).startsOn).toBeNull();
    expect(assignProgramSchema.parse({ clientId: "c1" }).startsOn).toBeNull();
  });
  it("stores a start date at UTC midnight", () => {
    expect(assignProgramSchema.parse({ clientId: "c1", startsOn: "2026-11-02" }).startsOn).toEqual(
      new Date("2026-11-02T00:00:00Z"),
    );
  });
  it("rejects impossible dates", () => {
    expect(assignProgramSchema.safeParse({ clientId: "c1", startsOn: "2026-02-30" }).success).toBe(false);
    expect(assignProgramSchema.safeParse({ clientId: "c1", startsOn: "next week" }).success).toBe(false);
  });
});

describe("clientNoteSchema", () => {
  it("trims and requires a body", () => {
    expect(clientNoteSchema.parse({ body: "  Knee feels better  " }).body).toBe("Knee feels better");
    expect(clientNoteSchema.safeParse({ body: "   " }).success).toBe(false);
  });
});

describe("parseWorkoutLog", () => {
  const ids = ["squat", "plank"];
  const form = (values: Record<string, string>) => values;

  it("reads sets, reps and weight per exercise", () => {
    const result = parseWorkoutLog(
      form({
        [logFieldName("squat", "sets")]: "3",
        [logFieldName("squat", "reps")]: "8",
        [logFieldName("squat", "weight")]: "42,5",
        [logFieldName("plank", "sets")]: "3",
        [logFieldName("plank", "reps")]: "30s",
        [logFieldName("plank", "weight")]: "",
        effort: "7",
        notes: " Felt strong ",
      }),
      ids,
    );
    expect(result).toEqual({
      ok: true,
      data: {
        effort: 7,
        notes: "Felt strong",
        entries: [
          { exerciseId: "squat", setsDone: 3, reps: "8", weightKg: 42.5 },
          { exerciseId: "plank", setsDone: 3, reps: "30s", weightKg: null },
        ],
      },
    });
  });

  it("skips exercises with no sets and ignores unknown ids", () => {
    const result = parseWorkoutLog(
      form({
        [logFieldName("squat", "sets")]: "2",
        [logFieldName("squat", "reps")]: "5",
        [logFieldName("plank", "sets")]: "0",
        [logFieldName("someone-elses", "sets")]: "9",
      }),
      ids,
    );
    expect(result.ok && result.data.entries.map((e) => e.exerciseId)).toEqual(["squat"]);
    expect(result.ok && result.data.effort).toBeNull();
  });

  it("reports field errors by input name", () => {
    const result = parseWorkoutLog(
      form({
        [logFieldName("squat", "sets")]: "3",
        [logFieldName("squat", "weight")]: "heavy",
        effort: "11",
      }),
      ids,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors[logFieldName("squat", "weight")]).toEqual(["Enter kilograms, e.g. 42.5"]);
      expect(result.fieldErrors.effort).toEqual(["Choose 1 to 10"]);
    }
  });

  it("rejects weights that are out of range", () => {
    const result = parseWorkoutLog(
      form({ [logFieldName("squat", "sets")]: "3", [logFieldName("squat", "weight")]: "2000" }),
      ids,
    );
    expect(!result.ok && result.fieldErrors[logFieldName("squat", "weight")]).toEqual(["That's more than 1000 kg"]);
  });

  it("needs at least one exercise done", () => {
    const result = parseWorkoutLog(form({}), ids);
    expect(result).toMatchObject({ ok: false, error: "Enter the sets you did for at least one exercise." });
  });

  it("allows a workout without exercises", () => {
    expect(parseWorkoutLog(form({ notes: "Mobility flow" }), [])).toMatchObject({ ok: true });
  });
});
