import { TZDate } from "@date-fns/tz";
import { startOfWeek, subWeeks } from "date-fns";

/**
 * Pure workout metrics: weekly counts, streaks, volume and personal bests.
 * Weeks start on Monday in the given IANA timezone (UTC by default).
 */

export type LoggedExercise = {
  /** Exercise name as written in the program; bests are grouped by name. */
  exerciseName: string;
  completedAt: Date;
  setsDone: number;
  /** What the client typed, e.g. "8", "8-12" or "AMRAP". */
  reps: string;
  weightKg: number | null;
};

export type PersonalBest = {
  name: string;
  maxWeightKg: number;
  maxWeightOn: Date;
  /** Best estimated one-rep max (Epley), or null if no entry had countable reps. */
  bestOneRepMaxKg: number | null;
  bestOneRepMaxOn: Date | null;
  /** Heaviest weight per session, oldest first. */
  history: { date: Date; weightKg: number }[];
  lastLoggedAt: Date;
};

export type WeekCount = { weekStart: Date; count: number };

/** A unit straight after the number means time or distance ("30s", "40m", "1 min"), not reps. */
const TIME_OR_DISTANCE =
  /^\s*(?:s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|km|mi|miles?|yds?|yards?|ft|feet|metres?|meters?)\b/i;

/**
 * The first whole number in a reps entry: "8-12" -> 8, "10" -> 10, "5x5" -> 5,
 * "12 reps" -> 12. Returns null when there are no countable reps, e.g. "AMRAP",
 * "30s" or "40m".
 */
export function repsLowerBound(reps: string): number | null {
  const match = /(\d+)(.*)$/.exec(reps);
  if (!match || TIME_OR_DISTANCE.test(match[2])) return null;
  const value = Number(match[1]);
  return value > 0 ? value : null;
}

/**
 * Estimated one-rep max using the Epley formula: weight × (1 + reps / 30).
 * A single rep is the one-rep max itself.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps > 0)) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Sets × reps (lower bound) × weight. Zero when any part is missing. */
export function entryVolume(entry: Pick<LoggedExercise, "setsDone" | "reps" | "weightKg">): number {
  const reps = repsLowerBound(entry.reps);
  if (!reps || !entry.weightKg || entry.weightKg <= 0 || entry.setsDone <= 0) return 0;
  return entry.setsDone * reps * entry.weightKg;
}

/** Total volume in kg for one logged workout. */
export function workoutVolume(entries: Pick<LoggedExercise, "setsDone" | "reps" | "weightKg">[]): number {
  return entries.reduce((sum, e) => sum + entryVolume(e), 0);
}

/** Monday 00:00 of the week containing `date`, in `timeZone`. */
export function startOfWeekIn(date: Date, timeZone = "UTC"): Date {
  return new Date(startOfWeek(new TZDate(date, timeZone), { weekStartsOn: 1 }).getTime());
}

function previousWeekStart(weekStart: Date, timeZone: string): Date {
  return startOfWeekIn(subWeeks(new TZDate(weekStart, timeZone), 1), timeZone);
}

/** Workouts per week for the last `weeks` weeks, oldest first, ending with the current week. */
export function weeklyCounts(dates: Date[], now: Date, timeZone = "UTC", weeks = 8): WeekCount[] {
  const counts = new Map<number, number>();
  for (const date of dates) {
    const key = startOfWeekIn(date, timeZone).getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result: WeekCount[] = [];
  let cursor = startOfWeekIn(now, timeZone);
  for (let i = 0; i < weeks; i++) {
    result.unshift({ weekStart: cursor, count: counts.get(cursor.getTime()) ?? 0 });
    cursor = previousWeekStart(cursor, timeZone);
  }
  return result;
}

/** Workouts logged in the current week. */
export function workoutsThisWeek(dates: Date[], now: Date, timeZone = "UTC"): number {
  return weeklyCounts(dates, now, timeZone, 1)[0].count;
}

/**
 * Consecutive weeks with at least one workout, counting back from the current week.
 * A week that hasn't got a workout yet doesn't break the streak until it is over.
 */
export function weeklyStreak(dates: Date[], now: Date, timeZone = "UTC"): number {
  const active = new Set(dates.map((d) => startOfWeekIn(d, timeZone).getTime()));
  let cursor = startOfWeekIn(now, timeZone);
  if (!active.has(cursor.getTime())) cursor = previousWeekStart(cursor, timeZone);
  let streak = 0;
  while (active.has(cursor.getTime())) {
    streak++;
    cursor = previousWeekStart(cursor, timeZone);
  }
  return streak;
}

/** Groups "Back Squat" and " back  squat" together. */
export function exerciseKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Heaviest weight and best estimated one-rep max per exercise, with the heaviest
 * weight of each session for charting. Entries without a weight are ignored.
 * Sorted by the most recently trained exercise first.
 */
export function personalBests(entries: LoggedExercise[]): PersonalBest[] {
  const sorted = entries
    .filter((e) => e.weightKg !== null && e.weightKg > 0 && e.setsDone > 0)
    .toSorted((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  const bests = new Map<string, PersonalBest>();
  for (const entry of sorted) {
    const weight = entry.weightKg!;
    const key = exerciseKey(entry.exerciseName);
    const reps = repsLowerBound(entry.reps);
    const oneRepMax = reps ? estimateOneRepMax(weight, reps) : null;

    let best = bests.get(key);
    if (!best) {
      best = {
        name: entry.exerciseName.trim(),
        maxWeightKg: weight,
        maxWeightOn: entry.completedAt,
        bestOneRepMaxKg: null,
        bestOneRepMaxOn: null,
        history: [],
        lastLoggedAt: entry.completedAt,
      };
      bests.set(key, best);
    }

    // Strictly greater, so a best keeps the date it was first reached.
    if (weight > best.maxWeightKg) {
      best.maxWeightKg = weight;
      best.maxWeightOn = entry.completedAt;
    }
    if (oneRepMax !== null && (best.bestOneRepMaxKg === null || oneRepMax > best.bestOneRepMaxKg)) {
      best.bestOneRepMaxKg = oneRepMax;
      best.bestOneRepMaxOn = entry.completedAt;
    }

    const last = best.history.at(-1);
    if (last && last.date.getTime() === entry.completedAt.getTime()) {
      last.weightKg = Math.max(last.weightKg, weight);
    } else {
      best.history.push({ date: entry.completedAt, weightKg: weight });
    }
    best.name = entry.exerciseName.trim();
    best.lastLoggedAt = entry.completedAt;
  }

  return [...bests.values()].toSorted((a, b) => b.lastLoggedAt.getTime() - a.lastLoggedAt.getTime());
}

/** 42.5 -> "42.5 kg", 40 -> "40 kg", 49.583 -> "49.6 kg". */
export function formatKg(kg: number, maximumFractionDigits = 1): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(kg)} kg`;
}

/** "Tue, Oct 20" in the given timezone. */
export function formatDay(date: Date, timeZone = "UTC", locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** "today", "yesterday", "3 days ago" or "Oct 20", by calendar day in `timeZone`. */
export function formatRelativeDay(date: Date, now: Date, timeZone = "UTC", locale = "en-US"): string {
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const days = Math.round(
    (Date.parse(`${dayKey(now)}T00:00:00Z`) - Date.parse(`${dayKey(date)}T00:00:00Z`)) / 86_400_000,
  );
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric" }).format(date);
}

/** True for a timezone name this runtime understands. */
export function isValidTimeZone(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
