import { describe, expect, it } from "vitest";
import {
  lockedMessage,
  lockExpired,
  lockMinutesLeft,
  lockUntil,
  MAX_FAILED_LOGINS,
  shouldCheckPassword,
  shouldLock,
} from "./login-throttle";

const now = new Date("2026-03-02T10:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe("login throttle", () => {
  it("checks the password for the first few attempts only", () => {
    expect(shouldCheckPassword(1)).toBe(true);
    expect(shouldCheckPassword(MAX_FAILED_LOGINS)).toBe(true);
    expect(shouldCheckPassword(MAX_FAILED_LOGINS + 1)).toBe(false);
  });

  it("locks after the last allowed wrong password", () => {
    expect(shouldLock(MAX_FAILED_LOGINS - 1)).toBe(false);
    expect(shouldLock(MAX_FAILED_LOGINS)).toBe(true);
  });

  it("locks for 15 minutes and then lets the count start again", () => {
    const state = { failedLoginCount: MAX_FAILED_LOGINS, loginLockedUntil: lockUntil(now) };
    expect(lockMinutesLeft(state, now)).toBe(15);
    expect(lockMinutesLeft(state, new Date(minutes(14).getTime() + 1))).toBe(1);
    expect(lockExpired(state, minutes(14))).toBe(false);
    expect(lockExpired(state, minutes(15))).toBe(true);
    expect(lockMinutesLeft(state, minutes(15))).toBe(0);
  });

  it("is never locked without a lock time", () => {
    const state = { failedLoginCount: 2, loginLockedUntil: null };
    expect(lockMinutesLeft(state, now)).toBe(0);
    expect(lockExpired(state, now)).toBe(false);
  });

  it("explains the wait in plain words", () => {
    expect(lockedMessage(1)).toBe("Too many failed attempts. Try again in a minute, or reset your password.");
    expect(lockedMessage(12)).toContain("12 minutes");
  });
});
