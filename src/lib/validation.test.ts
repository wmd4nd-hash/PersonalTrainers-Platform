import { describe, expect, it } from "vitest";
import { availabilityWindowSchema, signupSchema, trainerProfileSchema } from "./validation";

describe("signupSchema", () => {
  it("normalises email", () => {
    const result = signupSchema.parse({
      name: "Sam",
      email: " Sam@Example.com ",
      password: "longenough",
      role: "CLIENT",
    });
    expect(result.email).toBe("sam@example.com");
  });

  it("rejects short passwords", () => {
    const result = signupSchema.safeParse({
      name: "Sam",
      email: "sam@example.com",
      password: "short",
      role: "CLIENT",
    });
    expect(result.success).toBe(false);
  });
});

describe("trainerProfileSchema", () => {
  const base = {
    headline: "",
    bio: "",
    specialties: "Strength, mobility, strength, ",
    city: "",
    timezone: "Europe/London",
    yearsExperience: "3",
    sessionRate: "65",
    sessionMinutes: "60",
    offersInPerson: "on",
    cancellationWindowHours: "24",
    lateCancelFeePercent: "100",
    minNoticeHours: "2",
  };

  it("parses specialties, price and the publish checkbox", () => {
    const result = trainerProfileSchema.parse({ ...base, published: "on" });
    expect(result.specialties).toEqual(["strength", "mobility"]);
    expect(result.sessionRate).toBe(6500);
    expect(result.published).toBe(true);
    expect(trainerProfileSchema.parse(base).published).toBe(false);
  });

  it("requires at least one session type", () => {
    const { offersInPerson: _drop, ...noFormats } = base;
    expect(trainerProfileSchema.safeParse(noFormats).success).toBe(false);
  });

  it("only accepts https meeting links", () => {
    expect(trainerProfileSchema.safeParse({ ...base, meetingUrl: "http://zoom.us/j/1" }).success).toBe(false);
    expect(trainerProfileSchema.safeParse({ ...base, meetingUrl: "https://zoom.us/j/1" }).success).toBe(true);
  });

  it("rejects unknown timezones", () => {
    expect(trainerProfileSchema.safeParse({ ...base, timezone: "Mars/Olympus" }).success).toBe(false);
  });
});

describe("availabilityWindowSchema", () => {
  it("requires end after start", () => {
    expect(availabilityWindowSchema.safeParse({ dayOfWeek: "1", start: "10:00", end: "09:00" }).success).toBe(false);
    expect(availabilityWindowSchema.parse({ dayOfWeek: "1", start: "09:00", end: "10:30" })).toEqual({
      dayOfWeek: 1,
      start: 540,
      end: 630,
    });
  });
});
