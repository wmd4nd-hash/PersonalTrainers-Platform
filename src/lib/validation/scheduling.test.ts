import { describe, expect, it } from "vitest";
import { copyDaySchema, rescheduleSchema, timeOffSchema } from "./scheduling";

describe("timeOffSchema", () => {
  it("accepts an all-day block and defaults the end date", () => {
    const parsed = timeOffSchema.parse({ startDate: "2026-10-22", allDay: "on", reason: " Holiday " });
    expect(parsed).toEqual({
      startDate: "2026-10-22",
      endDate: "2026-10-22",
      allDay: true,
      startMinute: 0,
      endMinute: 1440,
      reason: "Holiday",
    });
  });

  it("accepts a part-day block", () => {
    const parsed = timeOffSchema.parse({
      startDate: "2026-10-22",
      endDate: "2026-10-22",
      startTime: "13:00",
      endTime: "15:30",
    });
    expect(parsed).toMatchObject({ allDay: false, startMinute: 780, endMinute: 930 });
  });

  it("rejects an end before the start", () => {
    const sameDay = timeOffSchema.safeParse({
      startDate: "2026-10-22",
      endDate: "2026-10-22",
      startTime: "15:00",
      endTime: "13:00",
    });
    expect(sameDay.success).toBe(false);
    expect(sameDay.error?.issues[0]?.path).toEqual(["endTime"]);

    const earlierDay = timeOffSchema.safeParse({ startDate: "2026-10-22", endDate: "2026-10-21", allDay: "on" });
    expect(earlierDay.error?.issues[0]?.path).toEqual(["endDate"]);
  });

  it("requires times unless it's all day", () => {
    const result = timeOffSchema.safeParse({ startDate: "2026-10-22", endDate: "2026-10-22", startTime: "" });
    expect(result.error?.issues[0]?.path).toEqual(["startTime"]);
  });

  it("rejects dates that don't exist", () => {
    expect(timeOffSchema.safeParse({ startDate: "2026-02-30", allDay: "on" }).success).toBe(false);
  });
});

describe("rescheduleSchema", () => {
  it("needs an ISO start time", () => {
    expect(rescheduleSchema.safeParse({ startsAt: "" }).success).toBe(false);
    expect(rescheduleSchema.parse({ startsAt: "2026-10-22T09:00:00.000Z" }).startsAt).toEqual(
      new Date("2026-10-22T09:00:00.000Z"),
    );
  });
});

describe("copyDaySchema", () => {
  it("only copies from a weekday", () => {
    expect(copyDaySchema.parse({ sourceDay: "1" })).toEqual({ sourceDay: 1 });
    expect(copyDaySchema.safeParse({ sourceDay: "6" }).success).toBe(false);
  });
});
