import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));
const newPassword = z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters");

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(200),
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "The passwords don't match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "The passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "Choose a password you haven't used here before",
    path: ["newPassword"],
  });

export const accountNameSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80, "Use at most 80 characters"),
});

export const emailPreferencesSchema = z.object({
  emailNotifications: z
    .literal("on")
    .optional()
    .transform((v) => v === "on"),
});

/** Ids that arrive as Server Action arguments. */
export const idSchema = z.string().min(1).max(64);

export const notificationListSchema = z.object({
  filter: z.enum(["all", "unread"]).catch("all"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export const outboxFilterSchema = z.object({
  status: z.enum(["ALL", "QUEUED", "SENT", "FAILED"]).catch("ALL"),
  q: z
    .string()
    .trim()
    .max(200)
    .catch(""),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

/**
 * Only internal paths are followed when opening a notification, so a stored
 * link can't send people to another site ("//evil.com", "/\\evil.com").
 */
export function safeInternalPath(link: string | null | undefined): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.startsWith("/\\")) return null;
  if (/[\u0000-\u001F\s]/.test(link)) return null;
  return link;
}

/** First value of a search param that may be repeated. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
