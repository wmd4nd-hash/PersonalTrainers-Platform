import { z } from "zod";

/** Forms and URL filters for verification and the admin area. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Parses "YYYY-MM-DD" as UTC midnight, or null if it isn't a real date. */
export function parseDay(value: string): Date | null {
  if (!DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export const documentKinds = ["CERTIFICATION", "INSURANCE", "IDENTITY", "OTHER"] as const;

export const documentUploadSchema = z.object({
  kind: z.enum(documentKinds, "Choose what kind of document this is"),
  expiresOn: z
    .string()
    .trim()
    .default("")
    .transform((value, ctx) => {
      if (!value) return null;
      const date = parseDay(value);
      if (!date || date.getUTCFullYear() > 2100) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date" });
        return z.NEVER;
      }
      return date;
    }),
});

export const documentReviewSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"], "Choose approve or reject"),
    note: z.string().trim().max(500, "Keep the note under 500 characters").default(""),
  })
  .refine((v) => v.decision === "APPROVED" || v.note.length > 0, {
    message: "Tell the trainer what needs fixing",
    path: ["note"],
  });

export const adminCancelSchema = z.object({
  reason: z.string().trim().max(300, "Keep the reason under 300 characters").default(""),
});

// URL filters never fail: anything unexpected falls back to the default.

type SearchParamValue = string | string[] | undefined;

function first(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

const text = z.preprocess(first, z.string().trim().max(100).catch("")).default("");
const page = z.preprocess(first, z.coerce.number().int().min(1).max(10_000).catch(1)).default(1);
const day = z.preprocess(
  first,
  z
    .string()
    .optional()
    .transform((v) => (v ? parseDay(v) : null))
    .catch(null),
);

export const userFiltersSchema = z.object({
  q: text,
  role: z.preprocess(first, z.enum(["CLIENT", "TRAINER", "ADMIN"]).optional().catch(undefined)),
  page,
});

export const bookingFiltersSchema = z
  .object({
    q: text,
    status: z.preprocess(
      first,
      z.enum(["PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "COMPLETED"]).optional().catch(undefined),
    ),
    from: day,
    to: day,
    page,
  })
  .transform((f) => (f.from && f.to && f.from > f.to ? { ...f, from: f.to, to: f.from } : f));

export type UserFilters = z.infer<typeof userFiltersSchema>;
export type BookingFilters = z.infer<typeof bookingFiltersSchema>;

export function parseUserFilters(params: Record<string, SearchParamValue>): UserFilters {
  return userFiltersSchema.parse(params);
}

export function parseBookingFilters(params: Record<string, SearchParamValue>): BookingFilters {
  return bookingFiltersSchema.parse(params);
}

/** Total pages for a result count, never less than 1. */
export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}
