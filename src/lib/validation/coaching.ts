import { z } from "zod";
import type { FieldErrors, FormState } from "../validation";

/** Form state that echoes the submitted values back, so a rejected form keeps what was typed. */
export type FormStateWithValues = FormState & { values?: Record<string, string> };

/** "2026-10-25" -> Date at 00:00 UTC, "" -> null. Calendar dates are stored at UTC midnight. */
const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((value, ctx) => {
    if (value === "") return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return date;
  });

export const assignProgramSchema = z.object({
  clientId: z.string().trim().min(1, "Choose a client"),
  startsOn: optionalDate,
});

export const assignToClientSchema = z.object({
  programId: z.string().trim().min(1, "Choose a program"),
  startsOn: optionalDate,
});

export const clientNoteSchema = z.object({
  body: z.string().trim().min(1, "Write a note first").max(2000, "Keep notes under 2000 characters"),
});

/** Accepts "42.5" or "42,5"; empty means no weight (bodyweight). */
const optionalWeight = z
  .string()
  .trim()
  .default("")
  .transform((value, ctx) => {
    if (value === "") return null;
    const normalised = value.replace(",", ".");
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalised)) {
      ctx.addIssue({ code: "custom", message: "Enter kilograms, e.g. 42.5" });
      return z.NEVER;
    }
    const kg = Number(normalised);
    if (kg > 1000) {
      ctx.addIssue({ code: "custom", message: "That's more than 1000 kg" });
      return z.NEVER;
    }
    return kg;
  });

const exerciseEntrySchema = z.object({
  setsDone: z.coerce
    .number("Enter how many sets you did")
    .int("Use a whole number")
    .min(0, "Can't be negative")
    .max(50, "That's a lot of sets. Use 50 or fewer"),
  reps: z.string().trim().max(30, "Keep reps short, e.g. 10 or 8-10").default(""),
  weightKg: optionalWeight,
});

const logDetailsSchema = z.object({
  effort: z
    .string()
    .trim()
    .default("")
    .transform((value, ctx) => {
      if (value === "") return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        ctx.addIssue({ code: "custom", message: "Choose 1 to 10" });
        return z.NEVER;
      }
      return n;
    }),
  notes: z.string().trim().max(1000, "Keep notes under 1000 characters").default(""),
});

export type WorkoutLogEntry = { exerciseId: string } & z.infer<typeof exerciseEntrySchema>;

export type WorkoutLogInput = z.infer<typeof logDetailsSchema> & { entries: WorkoutLogEntry[] };

/** Form field name for one exercise's input, e.g. `ex.abc123.sets`. */
export function logFieldName(exerciseId: string, field: "sets" | "reps" | "weight") {
  return `ex.${exerciseId}.${field}`;
}

/**
 * Parses the workout log form. Only the exercises passed in are read, so ids
 * in the form that aren't part of the workout are ignored. Exercises with zero
 * sets are treated as skipped and left out.
 */
export function parseWorkoutLog(
  form: Record<string, string>,
  exerciseIds: string[],
): { ok: true; data: WorkoutLogInput } | { ok: false; fieldErrors: FieldErrors; error?: string } {
  const fieldErrors: FieldErrors = {};
  const entries: WorkoutLogEntry[] = [];

  for (const exerciseId of exerciseIds) {
    const names = {
      setsDone: logFieldName(exerciseId, "sets"),
      reps: logFieldName(exerciseId, "reps"),
      weightKg: logFieldName(exerciseId, "weight"),
    };
    const parsed = exerciseEntrySchema.safeParse({
      setsDone: form[names.setsDone] || "0",
      reps: form[names.reps],
      weightKg: form[names.weightKg],
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = names[issue.path[0] as keyof typeof names];
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      continue;
    }
    if (parsed.data.setsDone > 0) entries.push({ exerciseId, ...parsed.data });
  }

  const details = logDetailsSchema.safeParse({ effort: form.effort, notes: form.notes });
  if (!details.success) {
    for (const issue of details.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !details.success) {
    return { ok: false, fieldErrors, error: "Check the highlighted fields." };
  }
  if (exerciseIds.length > 0 && entries.length === 0) {
    return { ok: false, fieldErrors, error: "Enter the sets you did for at least one exercise." };
  }
  return { ok: true, data: { ...details.data, entries } };
}
