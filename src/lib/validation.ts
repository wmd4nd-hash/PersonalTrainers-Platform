import { z } from "zod";
import { parseMoneyToCents } from "./money";
import { parseTimeOfDay } from "./scheduling";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email,
  password: z.string().min(8, "Use at least 8 characters").max(128),
  role: z.enum(["TRAINER", "CLIENT"], "Choose an account type"),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

function isTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const checkbox = z.literal("on").optional().transform((v) => v === "on");

const commaList = (max: number) =>
  z
    .string()
    .default("")
    .transform((s) =>
      [...new Set(s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, max),
    );

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Use a full https:// link");

export const trainerProfileSchema = z
  .object({
    headline: z.string().trim().max(120),
    bio: z.string().trim().max(2000),
    specialties: commaList(10),
    languages: commaList(8),
    gender: z.enum(["FEMALE", "MALE", "NON_BINARY", "UNSPECIFIED"]).default("UNSPECIFIED"),
    city: z.string().trim().max(80),
    timezone: z.string().trim().refine(isTimezone, "Unknown timezone"),
    yearsExperience: z.coerce.number().int().min(0).max(60),
    sessionRate: z.string().transform((s, ctx) => {
      const cents = parseMoneyToCents(s);
      if (cents === null || cents < 100) {
        ctx.addIssue({ code: "custom", message: "Enter a price of at least 1.00" });
        return z.NEVER;
      }
      return cents;
    }),
    sessionMinutes: z.coerce.number().int().min(15).max(240),
    offersInPerson: checkbox,
    offersOnline: checkbox,
    defaultLocation: z.string().trim().max(200).default(""),
    meetingUrl: optionalUrl.default(""),
    cancellationWindowHours: z.coerce.number().int().min(0).max(168),
    lateCancelFeePercent: z.coerce.number().int().min(0).max(100),
    minNoticeHours: z.coerce.number().int().min(0).max(72),
    published: checkbox,
  })
  .refine((p) => p.offersInPerson || p.offersOnline, {
    message: "Offer in-person sessions, online sessions or both",
    path: ["offersOnline"],
  });

const timeOfDay = z.string().transform((s, ctx) => {
  const minute = parseTimeOfDay(s);
  if (minute === null) {
    ctx.addIssue({ code: "custom", message: "Use HH:MM" });
    return z.NEVER;
  }
  return minute;
});

export const availabilityWindowSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    start: timeOfDay,
    end: timeOfDay,
  })
  .refine((w) => w.end > w.start, { message: "End must be after start", path: ["end"] });

export const bookingSchema = z.object({
  trainerId: z.string().min(1),
  startsAt: z.iso.datetime().transform((s) => new Date(s)),
  format: z.enum(["IN_PERSON", "ONLINE"]).default("IN_PERSON"),
  /** Pay with a session from this package purchase instead of by card. */
  packagePurchaseId: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  notes: z.string().trim().max(500).default(""),
});

export const programSchema = z.object({
  title: z.string().trim().min(2, "Give the program a title").max(120),
  description: z.string().trim().max(2000),
});

export const workoutSchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(365),
  title: z.string().trim().min(1, "Give the workout a title").max(120),
  notes: z.string().trim().max(1000),
});

export const exerciseSchema = z.object({
  name: z.string().trim().min(1, "Name the exercise").max(120),
  sets: z.coerce.number().int().min(1).max(20),
  reps: z.string().trim().min(1, "Enter reps, e.g. 8-12").max(30),
  restSeconds: z.coerce.number().int().min(0).max(900),
});

export type FieldErrors = Record<string, string[] | undefined>;

export type FormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  ok?: boolean;
};

export function formToObject(formData: FormData) {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function fieldErrorsOf(error: z.ZodError): FormState {
  return { fieldErrors: z.flattenError(error).fieldErrors as FieldErrors };
}
