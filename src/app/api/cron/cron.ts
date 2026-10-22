/** Pure helpers shared by the cron Route Handlers. */
import { timingSafeEqual } from "node:crypto";

const HOUR = 3_600_000;

/**
 * Cron endpoints need `Authorization: Bearer <CRON_SECRET>`. Without a secret
 * configured they only run in development, so a forgotten env var never leaves
 * them open in production.
 */
export function isCronAuthorized(
  authorization: string | null,
  secret: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  if (!secret) return nodeEnv === "development";
  if (!authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** The 24-hour reminder goes to sessions starting 23 to 25 hours from now. */
export function reminderWindow(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() + 23 * HOUR), to: new Date(now.getTime() + 25 * HOUR) };
}

/** Confirmed sessions that ended more than 12 hours ago count as done. */
export function completionCutoff(now: Date): Date {
  return new Date(now.getTime() - 12 * HOUR);
}

/** `?limit=` for batch jobs, clamped to a safe range. */
export function batchLimit(value: string | null, fallback: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}
