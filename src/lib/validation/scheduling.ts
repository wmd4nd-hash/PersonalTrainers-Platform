import { z } from "zod";
import { DAY_NAMES, parseDateKey, parseTimeOfDay } from "../scheduling";

const checkbox = z.literal("on").optional().transform((v) => v === "on");

const dateKey = z
  .string()
  .trim()
  .refine((v) => parseDateKey(v) !== null, "Pick a date");

const optionalTime = z
  .string()
  .trim()
  .optional()
  .transform((s, ctx) => {
    if (!s) return null;
    const minute = parseTimeOfDay(s);
    if (minute === null) {
      ctx.addIssue({ code: "custom", message: "Use HH:MM" });
      return z.NEVER;
    }
    return minute;
  });

/** Longest single block of time off, to catch typos in the year. */
export const MAX_TIME_OFF_DAYS = 366;

/** Time off as entered in the trainer's timezone. Convert with `timeOffRange`. */
export const timeOffSchema = z
  .object({
    startDate: dateKey,
    endDate: z.string().trim().optional(),
    allDay: checkbox,
    startTime: optionalTime,
    endTime: optionalTime,
    reason: z.string().trim().max(120, "Keep it under 120 characters").default(""),
  })
  .transform((v, ctx) => {
    const endDate = v.endDate || v.startDate;
    if (!parseDateKey(endDate)) {
      ctx.addIssue({ code: "custom", message: "Pick a date", path: ["endDate"] });
      return z.NEVER;
    }
    if (endDate < v.startDate) {
      ctx.addIssue({ code: "custom", message: "The last day can't be before the first", path: ["endDate"] });
      return z.NEVER;
    }
    if (!v.allDay) {
      if (v.startTime === null) {
        ctx.addIssue({ code: "custom", message: "Enter a start time", path: ["startTime"] });
        return z.NEVER;
      }
      if (v.endTime === null) {
        ctx.addIssue({ code: "custom", message: "Enter an end time", path: ["endTime"] });
        return z.NEVER;
      }
      if (endDate === v.startDate && v.endTime <= v.startTime) {
        ctx.addIssue({ code: "custom", message: "End must be after start", path: ["endTime"] });
        return z.NEVER;
      }
    }
    return {
      startDate: v.startDate,
      endDate,
      allDay: v.allDay,
      startMinute: v.allDay ? 0 : (v.startTime ?? 0),
      endMinute: v.allDay ? 1440 : (v.endTime ?? 0),
      reason: v.reason,
    };
  });

export type TimeOffValues = z.output<typeof timeOffSchema>;

export const rescheduleSchema = z.object({
  startsAt: z.iso.datetime({ error: "Pick a new time" }).transform((s) => new Date(s)),
});

export const copyDaySchema = z.object({
  sourceDay: z.coerce
    .number()
    .int()
    .min(0)
    .max(6)
    .refine((d) => d >= 1 && d <= 5, `Pick a weekday (${DAY_NAMES[1]} to ${DAY_NAMES[5]})`),
});
