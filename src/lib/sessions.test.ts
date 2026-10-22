import { describe, expect, it } from "vitest";
import { joinUrl, meetingUrlFor, sessionPhase } from "./sessions";

const session = {
  startsAt: new Date("2026-03-02T10:00:00Z"),
  endsAt: new Date("2026-03-02T11:00:00Z"),
};

describe("meetingUrlFor", () => {
  it("prefers the trainer's own link", () => {
    expect(meetingUrlFor({ meetingUrl: " https://zoom.us/j/1 " }, "b1")).toBe("https://zoom.us/j/1");
    expect(meetingUrlFor({ meetingUrl: "" }, "b1")).toBe("https://meet.jit.si/ptp-b1");
  });
});

describe("sessionPhase", () => {
  it("moves from upcoming to ended", () => {
    expect(sessionPhase(session, new Date("2026-03-02T09:00:00Z"))).toBe("upcoming");
    expect(sessionPhase(session, new Date("2026-03-02T09:50:00Z"))).toBe("starting-soon");
    expect(sessionPhase(session, new Date("2026-03-02T10:30:00Z"))).toBe("in-progress");
    expect(sessionPhase(session, new Date("2026-03-02T11:00:00Z"))).toBe("ended");
  });
});

describe("joinUrl", () => {
  const online = { ...session, format: "ONLINE", status: "CONFIRMED", meetingUrl: "https://meet.jit.si/x" };

  it("shows the link for confirmed online sessions until they end", () => {
    expect(joinUrl(online, new Date("2026-03-01T10:00:00Z"))).toBe("https://meet.jit.si/x");
    expect(joinUrl(online, new Date("2026-03-02T10:30:00Z"))).toBe("https://meet.jit.si/x");
    expect(joinUrl(online, new Date("2026-03-02T11:30:00Z"))).toBeNull();
  });

  it("hides it for in-person, unpaid or cancelled sessions", () => {
    const before = new Date("2026-03-01T10:00:00Z");
    expect(joinUrl({ ...online, format: "IN_PERSON" }, before)).toBeNull();
    expect(joinUrl({ ...online, status: "PENDING_PAYMENT" }, before)).toBeNull();
    expect(joinUrl({ ...online, status: "CANCELLED" }, before)).toBeNull();
    expect(joinUrl({ ...online, meetingUrl: null }, before)).toBeNull();
  });
});
