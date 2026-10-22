import { z } from "zod";
import { parseMoneyToCents } from "../money";
import { PACKAGE_LIMITS } from "../package-pricing";

const { minSessions, maxSessions, minValidDays, maxValidDays, maxPriceCents } = PACKAGE_LIMITS;

const wholeNumber = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `Enter the ${label}` })
    .int("Use a whole number")
    .min(min, `Use between ${min} and ${max}`)
    .max(max, `Use between ${min} and ${max}`);

export const packageSchema = z
  .object({
    title: z.string().trim().min(2, "Give the package a name").max(80, "Keep the name under 80 characters"),
    description: z.string().trim().max(500, "Keep the description under 500 characters").default(""),
    sessionCount: wholeNumber("number of sessions", minSessions, maxSessions),
    /** Total price as typed, e.g. "292.50". Parsed to cents. */
    price: z.string().transform((s, ctx) => {
      const cents = parseMoneyToCents(s);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Enter a price like 250 or 249.50" });
        return z.NEVER;
      }
      if (cents > maxPriceCents) {
        ctx.addIssue({ code: "custom", message: "That price is too high" });
        return z.NEVER;
      }
      return cents;
    }),
    validDays: wholeNumber("number of days", minValidDays, maxValidDays),
  })
  .refine((p) => p.price >= p.sessionCount * 100, {
    message: "Charge at least 1.00 per session",
    path: ["price"],
  });

export type PackageInput = z.infer<typeof packageSchema>;
