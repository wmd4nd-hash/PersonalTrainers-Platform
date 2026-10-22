import { TZDate } from "@date-fns/tz";
import type { Prisma } from "@/generated/prisma/client";
import { GENDER_OPTIONS, genderOf, tagInSentence, tagLabel, visibleTrainerWhere, type GenderFilter } from "./search";

/** The matching quiz on /match: answers, hard requirements and scoring, as pure functions. */

export const MATCH_LIMIT = 5;
/** How far ahead we look for open times in the client's preferred time of day. */
export const MATCH_HORIZON_DAYS = 14;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const MATCH_FORMATS = [
  { value: "in-person", label: "In person", hint: "Meet at a gym, park or your home" },
  { value: "online", label: "Online", hint: "Video sessions from anywhere" },
  { value: "either", label: "Either is fine", hint: "Show me both" },
] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number]["value"];

export const TIMES_OF_DAY = [
  { value: "mornings", label: "Mornings", hint: "Before noon" },
  { value: "evenings", label: "Evenings", hint: "From 5pm" },
  { value: "weekends", label: "Weekends", hint: "Saturday or Sunday" },
] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number]["value"];

/** Budget choices per session, in whole currency units. */
export const BUDGET_OPTIONS = [50, 75, 100, 150] as const;

export type MatchAnswers = {
  /** A specialty, lowercase, e.g. "running". */
  goal?: string;
  format: MatchFormat;
  /** Where the client wants to meet; used for in-person sessions. */
  city?: string;
  budgetCents?: number;
  gender?: GenderFilter;
  /** Lowercase, e.g. "spanish". */
  language?: string;
  time?: TimeOfDay;
  /** The client's IANA timezone, so "mornings" means their mornings. */
  timezone?: string;
};

export const DEFAULT_ANSWERS: MatchAnswers = { format: "either" };

/** What scoring needs to know about a trainer. */
export type MatchCandidate = {
  id: string;
  headline: string;
  specialties: string[];
  languages: string[];
  city: string;
  offersInPerson: boolean;
  offersOnline: boolean;
  sessionRateCents: number;
  verified: boolean;
  ratingAverage: number;
  ratingCount: number;
  yearsExperience: number;
  timezone: string;
};

export type Availability = {
  /** Open session start times over the next MATCH_HORIZON_DAYS. */
  slots: Date[];
  now: Date;
};

export type MatchScore = {
  score: number;
  /** Up to three plain reasons, strongest first. */
  reasons: string[];
  /** Where the trainer falls short of an answer. */
  caveats: string[];
};

function cityMatches(trainerCity: string, wanted: string) {
  return trainerCity.toLowerCase().includes(wanted.trim().toLowerCase());
}

/**
 * Hard requirements: the trainer must be able to train the client the way
 * they asked, and be the gender they asked for. Everything else is scored.
 */
export function matchCandidatesWhere(answers: MatchAnswers): Prisma.TrainerProfileWhereInput {
  const and: Prisma.TrainerProfileWhereInput[] = [visibleTrainerWhere];
  const inPersonHere: Prisma.TrainerProfileWhereInput = {
    offersInPerson: true,
    ...(answers.city && { city: { contains: answers.city, mode: "insensitive" } }),
  };
  if (answers.format === "online") and.push({ offersOnline: true });
  if (answers.format === "in-person") and.push(inPersonHere);
  if (answers.format === "either" && answers.city) and.push({ OR: [{ offersOnline: true }, inPersonHere] });
  if (answers.gender) and.push({ user: { gender: genderOf(answers.gender) } });
  return { AND: and };
}

/** Which of the quiz's times of day a session start falls in, in `timezone`. */
export function timesOfDay(slot: Date, timezone: string): TimeOfDay[] {
  const local = new TZDate(slot, timezone);
  const hour = local.getHours();
  const day = local.getDay();
  const tags: TimeOfDay[] = [];
  if (hour >= 5 && hour < 12) tags.push("mornings");
  if (hour >= 17 && hour < 22) tags.push("evenings");
  if (day === 0 || day === 6) tags.push("weekends");
  return tags;
}

const freeTimeText: Record<TimeOfDay, { soon: string; later: string; none: string }> = {
  mornings: {
    soon: "Free mornings this week",
    later: "Free mornings in the next two weeks",
    none: "No free mornings in the next two weeks",
  },
  evenings: {
    soon: "Free evenings this week",
    later: "Free evenings in the next two weeks",
    none: "No free evenings in the next two weeks",
  },
  weekends: {
    soon: "Free this weekend",
    later: "Free at weekends in the next two weeks",
    none: "No free weekend times in the next two weeks",
  },
};

function reviewText(average: number, count: number) {
  return `${average.toFixed(1)} from ${count} ${count === 1 ? "review" : "reviews"}`;
}

/**
 * Scores one trainer against the answers. Higher is better; the number only
 * matters relative to other trainers. `availability` is optional so callers
 * can rank cheaply first and only work out open times for the leaders.
 */
export function scoreMatch(
  trainer: MatchCandidate,
  answers: MatchAnswers,
  availability?: Availability,
): MatchScore {
  const reasons: { text: string; weight: number }[] = [];
  const caveats: string[] = [];
  let score = 0;
  const reason = (text: string, weight: number, points = weight) => {
    reasons.push({ text, weight });
    score += points;
  };

  if (answers.goal) {
    if (trainer.specialties.includes(answers.goal)) {
      reason(`Specialises in ${tagInSentence(answers.goal)}`, 40);
    } else if (trainer.headline.toLowerCase().includes(answers.goal)) {
      reason(`Works on ${tagInSentence(answers.goal)}`, 15);
    }
  }

  if (answers.language) {
    if (trainer.languages.includes(answers.language)) {
      reason(`Speaks ${tagLabel(answers.language)}`, 20);
    } else {
      score -= 30;
      caveats.push(`Doesn't list ${tagLabel(answers.language)}`);
    }
  }

  if (answers.budgetCents !== undefined) {
    if (trainer.sessionRateCents <= answers.budgetCents) {
      reason("Within your budget", 15);
    } else {
      const over = (trainer.sessionRateCents - answers.budgetCents) / answers.budgetCents;
      score -= Math.min(30, 10 + Math.round(over * 40));
      caveats.push("Above your budget");
    }
  }

  const local = answers.format !== "online" && answers.city && trainer.offersInPerson && cityMatches(trainer.city, answers.city);
  if (local) {
    reason(`Trains in person in ${trainer.city}`, 12);
  } else if (answers.format !== "in-person" && trainer.offersOnline) {
    reason("Offers online sessions", 4, 0);
  } else if (trainer.offersInPerson) {
    reason("Trains in person", 4, 0);
  }

  if (availability) {
    const timezone = answers.timezone ?? trainer.timezone;
    const wanted = answers.time;
    const matching = wanted ? availability.slots.filter((s) => timesOfDay(s, timezone).includes(wanted)) : availability.slots;
    const soon = matching.some((s) => s.getTime() - availability.now.getTime() < WEEK_MS);
    if (matching.length > 0) {
      if (wanted) reason(soon ? freeTimeText[wanted].soon : freeTimeText[wanted].later, 15, Math.min(15, 8 + matching.length));
      else reason(soon ? "Free this week" : "Free in the next two weeks", 6, Math.min(6, matching.length));
    } else {
      score -= 10;
      caveats.push(wanted ? freeTimeText[wanted].none : "No open times in the next two weeks");
    }
  }

  if (trainer.ratingCount > 0) {
    // Few reviews count for less, so one 5-star review doesn't top the list.
    const confidence = Math.min(1, trainer.ratingCount / 5);
    score += Math.max(0, trainer.ratingAverage - 3) * 5 * confidence;
    if (trainer.ratingAverage >= 4) reasons.push({ text: reviewText(trainer.ratingAverage, trainer.ratingCount), weight: 10 });
  }

  if (trainer.verified) reason("Verified trainer", 8);

  score += Math.min(trainer.yearsExperience, 15) / 3;
  if (trainer.yearsExperience >= 5) reasons.push({ text: `${trainer.yearsExperience} years' experience`, weight: 5 });

  return {
    score: Math.round(score * 10) / 10,
    reasons: reasons
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((r) => r.text),
    caveats,
  };
}

export type RankedMatch<T extends MatchCandidate> = MatchScore & { trainer: T };

/** Best matches first. Ties go to the better-reviewed, then more experienced trainer. */
export function rankMatches<T extends MatchCandidate>(
  trainers: T[],
  answers: MatchAnswers,
  availability?: (trainer: T) => Availability | undefined,
  limit = MATCH_LIMIT,
): RankedMatch<T>[] {
  return trainers
    .map((trainer) => ({ trainer, ...scoreMatch(trainer, answers, availability?.(trainer)) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.trainer.ratingAverage - a.trainer.ratingAverage ||
        b.trainer.ratingCount - a.trainer.ratingCount ||
        b.trainer.yearsExperience - a.trainer.yearsExperience ||
        a.trainer.id.localeCompare(b.trainer.id),
    )
    .slice(0, limit);
}

/** The answers as URL params, so quiz steps and results can be shared and bookmarked. */
export function matchParamsOf(answers: MatchAnswers): URLSearchParams {
  const params = new URLSearchParams();
  if (answers.goal) params.set("goal", answers.goal);
  if (answers.format !== "either") params.set("format", answers.format);
  if (answers.city) params.set("city", answers.city);
  if (answers.budgetCents !== undefined) params.set("budget", String(Math.round(answers.budgetCents / 100)));
  if (answers.gender) params.set("gender", answers.gender);
  if (answers.language) params.set("language", answers.language);
  if (answers.time) params.set("time", answers.time);
  if (answers.timezone) params.set("tz", answers.timezone);
  return params;
}

export function matchHref(path: "/match" | "/match/results", answers: MatchAnswers, extra: Record<string, string> = {}) {
  const params = matchParamsOf(answers);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** A short summary of the answers, e.g. ["Running", "Online", "Up to 80", "Mornings"]. */
export function describeAnswers(answers: MatchAnswers): string[] {
  const parts: string[] = [];
  if (answers.goal) parts.push(tagLabel(answers.goal));
  if (answers.format === "in-person") parts.push(answers.city ? `In person in ${answers.city}` : "In person");
  if (answers.format === "online") parts.push("Online");
  if (answers.format === "either") parts.push(answers.city ? `In person in ${answers.city} or online` : "In person or online");
  if (answers.budgetCents !== undefined) parts.push(`Up to ${Math.round(answers.budgetCents / 100)} a session`);
  if (answers.time) parts.push(TIMES_OF_DAY.find((t) => t.value === answers.time)!.label);
  if (answers.gender) parts.push(`${GENDER_OPTIONS.find((g) => g.value === answers.gender)!.label} trainer`);
  if (answers.language) parts.push(`Speaks ${tagLabel(answers.language)}`);
  return parts;
}
