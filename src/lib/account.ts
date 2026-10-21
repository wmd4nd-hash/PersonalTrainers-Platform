/**
 * Account security helpers: password reset tokens, the reset throttle and
 * calendar feed tokens. Pure apart from randomness; database work lives in the
 * account Server Actions.
 */
import { createHash, randomBytes } from "node:crypto";

/** How long a password reset link works. */
export const RESET_TOKEN_TTL_MINUTES = 60;
/** At most this many reset emails per address in a rolling hour. */
export const RESET_EMAILS_PER_HOUR = 3;

/** A URL-safe random secret with 256 bits of entropy. */
export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Reset tokens are stored as SHA-256 hashes, so a database leak can't be used to reset passwords. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function resetTokenExpiry(now: Date): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000);
}

/** Start of the window the reset throttle counts emails in. */
export function resetThrottleSince(now: Date): Date {
  return new Date(now.getTime() - 60 * 60_000);
}

export function canSendResetEmail(sentInLastHour: number): boolean {
  return sentInLastHour < RESET_EMAILS_PER_HOUR;
}

export type ResetTokenState = { expiresAt: Date; usedAt: Date | null } | null;

/** Why a reset link can't be used, or null when it can. */
export function resetTokenProblem(token: ResetTokenState, now: Date): "missing" | "used" | "expired" | null {
  if (!token) return "missing";
  if (token.usedAt) return "used";
  if (token.expiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}

/** Calendar feed tokens are long random strings, so feed URLs can't be guessed. */
export function generateCalendarToken(): string {
  return generateSecret(24);
}

/** Feed paths look like /api/calendar/<token>; a trailing ".ics" is accepted too. */
export function parseCalendarToken(param: string): string | null {
  const token = param.replace(/\.ics$/i, "");
  return /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : null;
}
