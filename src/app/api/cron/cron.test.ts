import { describe, expect, it } from "vitest";
import { batchLimit, completionCutoff, isCronAuthorized, reminderWindow } from "./cron";

describe("isCronAuthorized", () => {
  it("requires the exact bearer token when a secret is set", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret", "production")).toBe(true);
    expect(isCronAuthorized("Bearer wrong!", "s3cret", "production")).toBe(false);
    expect(isCronAuthorized("Bearer s3cret ", "s3cret", "production")).toBe(false);
    expect(isCronAuthorized("s3cret", "s3cret", "production")).toBe(false);
    expect(isCronAuthorized(null, "s3cret", "development")).toBe(false);
  });

  it("only allows unauthenticated calls in development when no secret is set", () => {
    expect(isCronAuthorized(null, undefined, "development")).toBe(true);
    expect(isCronAuthorized(null, "", "development")).toBe(true);
    expect(isCronAuthorized(null, undefined, "production")).toBe(false);
    expect(isCronAuthorized("Bearer anything", undefined, "production")).toBe(false);
    expect(isCronAuthorized(null, undefined, "test")).toBe(false);
  });
});

describe("windows", () => {
  const now = new Date("2026-03-10T10:00:00Z");

  it("reminds about sessions 23 to 25 hours away", () => {
    expect(reminderWindow(now)).toEqual({
      from: new Date("2026-03-11T09:00:00Z"),
      to: new Date("2026-03-11T11:00:00Z"),
    });
  });

  it("completes sessions that ended over 12 hours ago", () => {
    expect(completionCutoff(now)).toEqual(new Date("2026-03-09T22:00:00Z"));
  });

  it("clamps batch sizes", () => {
    expect(batchLimit(null, 50, 200)).toBe(50);
    expect(batchLimit("10", 50, 200)).toBe(10);
    expect(batchLimit("5000", 50, 200)).toBe(200);
    expect(batchLimit("-1", 50, 200)).toBe(50);
    expect(batchLimit("abc", 50, 200)).toBe(50);
  });
});
