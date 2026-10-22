/** Wrong passwords in a row before the account is briefly locked. */
export const MAX_FAILED_LOGINS = 5;
export const LOGIN_LOCK_MINUTES = 15;

export type LoginThrottleState = { failedLoginCount: number; loginLockedUntil: Date | null };

/** Minutes left on a lock (rounded up), or 0 when logging in is allowed. */
export function lockMinutesLeft(state: LoginThrottleState, now: Date): number {
  if (!state.loginLockedUntil) return 0;
  const ms = state.loginLockedUntil.getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/** True when a lock has run out and the count should start again. */
export function lockExpired(state: LoginThrottleState, now: Date): boolean {
  return state.loginLockedUntil !== null && state.loginLockedUntil.getTime() <= now.getTime();
}

/**
 * Each attempt is counted before the password is checked, so `attempt` is this
 * attempt's number since the last successful login. Only the first
 * MAX_FAILED_LOGINS are checked at all: guesses sent in parallel can't get more.
 */
export function shouldCheckPassword(attempt: number): boolean {
  return attempt <= MAX_FAILED_LOGINS;
}

/** A wrong password on the last allowed attempt locks the account. */
export function shouldLock(attempt: number): boolean {
  return attempt >= MAX_FAILED_LOGINS;
}

export function lockUntil(now: Date): Date {
  return new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000);
}

export function lockedMessage(minutes: number = LOGIN_LOCK_MINUTES): string {
  const when = minutes === 1 ? "a minute" : `${minutes} minutes`;
  return `Too many failed attempts. Try again in ${when}, or reset your password.`;
}
