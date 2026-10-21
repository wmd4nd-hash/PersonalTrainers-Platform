import { describe, expect, it } from "vitest";
import {
  canSendResetEmail,
  generateCalendarToken,
  generateSecret,
  hashToken,
  parseCalendarToken,
  resetThrottleSince,
  resetTokenExpiry,
  resetTokenProblem,
} from "./account";

describe("reset tokens", () => {
  it("generates long, URL-safe, unique secrets", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("stores a SHA-256 hash, never the token", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("abc")).not.toContain("abc");
  });

  it("expires after an hour", () => {
    const now = new Date("2026-03-10T10:00:00Z");
    expect(resetTokenExpiry(now)).toEqual(new Date("2026-03-10T11:00:00Z"));
    expect(resetThrottleSince(now)).toEqual(new Date("2026-03-10T09:00:00Z"));
  });

  it("allows three emails an hour", () => {
    expect(canSendResetEmail(0)).toBe(true);
    expect(canSendResetEmail(2)).toBe(true);
    expect(canSendResetEmail(3)).toBe(false);
  });

  it("explains why a link can't be used", () => {
    const now = new Date("2026-03-10T10:00:00Z");
    const later = new Date("2026-03-10T10:30:00Z");
    expect(resetTokenProblem(null, now)).toBe("missing");
    expect(resetTokenProblem({ expiresAt: later, usedAt: now }, now)).toBe("used");
    expect(resetTokenProblem({ expiresAt: now, usedAt: null }, now)).toBe("expired");
    expect(resetTokenProblem({ expiresAt: later, usedAt: null }, now)).toBeNull();
  });
});

describe("calendar tokens", () => {
  it("generates tokens the feed route accepts", () => {
    const token = generateCalendarToken();
    expect(parseCalendarToken(token)).toBe(token);
    expect(parseCalendarToken(`${token}.ics`)).toBe(token);
  });

  it("accepts the cuid tokens accounts start with", () => {
    expect(parseCalendarToken("cmgz1x2y30000abcd1234efgh")).toBe("cmgz1x2y30000abcd1234efgh");
  });

  it("rejects anything else", () => {
    expect(parseCalendarToken("short")).toBeNull();
    expect(parseCalendarToken("../../etc/passwd-aaaaaaaaaa")).toBeNull();
    expect(parseCalendarToken("a".repeat(200))).toBeNull();
  });
});
