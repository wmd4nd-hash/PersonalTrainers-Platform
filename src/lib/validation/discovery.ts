import { z } from "zod";
import { BUDGET_OPTIONS, MATCH_FORMATS, TIMES_OF_DAY, type MatchAnswers } from "../matching";
import { parseMoneyToCents } from "../money";
import {
  FORMAT_OPTIONS,
  GENDER_OPTIONS,
  MIN_RATING_OPTIONS,
  SORT_OPTIONS,
  type TrainerSearch,
} from "../search";

/**
 * Search params come straight from the URL, so anything malformed is dropped
 * rather than shown as an error: a bad link still shows sensible results.
 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** The first value of a param, trimmed; blank becomes undefined. */
function first(value: unknown) {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

const text = (max: number) => z.preprocess(first, z.string().max(max).optional()).catch(undefined);

const lowerText = (max: number) =>
  z
    .preprocess(first, z.string().max(max).optional())
    .transform((s) => s?.toLowerCase())
    .catch(undefined);

function oneOf<const T extends readonly string[]>(values: T) {
  return z.preprocess(first, z.enum(values).optional()).catch(undefined);
}

const values = <T extends { value: string }>(options: readonly T[]) => options.map((o) => o.value) as [T["value"], ...T["value"][]];

/** A whole or decimal amount like "80" or "79.50", as cents. */
const amount = z
  .preprocess(first, z.string().optional())
  .transform((s) => {
    if (s === undefined) return undefined;
    const cents = parseMoneyToCents(s);
    return cents !== null && cents > 0 && cents <= 10_000_000 ? cents : undefined;
  })
  .catch(undefined);

function isTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const trainerSearchSchema = z.object({
  q: text(80),
  city: text(80),
  format: oneOf(values(FORMAT_OPTIONS)),
  maxPrice: amount,
  gender: oneOf(values(GENDER_OPTIONS)),
  language: lowerText(40),
  verified: z.preprocess(first, z.enum(["1", "true", "on"]).optional()).catch(undefined),
  minRating: z
    .preprocess(first, z.coerce.number().optional())
    .transform((n) => MIN_RATING_OPTIONS.find((r) => r === n))
    .catch(undefined),
  sort: z.preprocess(first, z.enum(values(SORT_OPTIONS)).default("recommended")).catch("recommended"),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000).default(1)).catch(1),
});

export function parseTrainerSearch(raw: RawSearchParams): TrainerSearch {
  const { maxPrice, verified, ...rest } = trainerSearchSchema.parse(raw);
  return { ...rest, maxPriceCents: maxPrice, verifiedOnly: verified !== undefined };
}

export const matchAnswersSchema = z.object({
  goal: lowerText(60),
  format: z.preprocess(first, z.enum(values(MATCH_FORMATS)).default("either")).catch("either"),
  city: text(80),
  budget: z
    .preprocess(first, z.coerce.number().optional())
    .transform((n) => BUDGET_OPTIONS.find((b) => b === n))
    .catch(undefined),
  gender: oneOf(values(GENDER_OPTIONS)),
  language: lowerText(40),
  time: oneOf(values(TIMES_OF_DAY)),
  tz: z.preprocess(first, z.string().max(64).refine(isTimezone).optional()).catch(undefined),
});

export function parseMatchAnswers(raw: RawSearchParams): MatchAnswers {
  const { budget, tz, city, ...rest } = matchAnswersSchema.parse(raw);
  return {
    ...rest,
    // A city only matters when the client might meet in person.
    city: rest.format === "online" ? undefined : city,
    budgetCents: budget === undefined ? undefined : budget * 100,
    timezone: tz,
  };
}

export const QUIZ_STEPS = 4;

export function parseQuizStep(raw: RawSearchParams): number {
  const step = Number(first(raw.step));
  return Number.isInteger(step) && step >= 1 && step <= QUIZ_STEPS ? step : 1;
}
