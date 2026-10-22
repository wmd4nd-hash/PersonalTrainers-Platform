import { describe, expect, it } from "vitest";
import { timeAgo } from "./time-ago";

const now = new Date("2026-03-10T12:00:00Z");
const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now);

describe("timeAgo", () => {
  it("describes recent times in words", () => {
    expect(ago(10_000)).toBe("just now");
    expect(ago(-60_000)).toBe("just now");
    expect(ago(5 * 60_000)).toBe("5 min ago");
    expect(ago(60 * 60_000)).toBe("1 hour ago");
    expect(ago(5 * 60 * 60_000)).toBe("5 hours ago");
    expect(ago(30 * 60 * 60_000)).toBe("yesterday");
    expect(ago(3 * 24 * 60 * 60_000)).toBe("3 days ago");
  });

  it("shows a date for older items", () => {
    expect(timeAgo(new Date("2026-02-01T09:00:00Z"), now)).toBe("Feb 1");
    expect(timeAgo(new Date("2025-12-24T09:00:00Z"), now)).toBe("Dec 24, 2025");
  });
});
