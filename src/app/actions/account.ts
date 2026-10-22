"use server";

import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { after } from "next/server";
import {
  canSendResetEmail,
  generateCalendarToken,
  generateSecret,
  hashToken,
  RESET_TOKEN_TTL_MINUTES,
  resetThrottleSince,
  resetTokenExpiry,
  resetTokenProblem,
} from "@/lib/account";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { passwordChangedEmail, passwordResetEmail } from "@/lib/email/templates";
import { emailEnv } from "@/lib/email/transport";
import { queueEmail } from "@/lib/notify";
import { appUrl } from "@/lib/stripe";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";
import {
  accountNameSchema,
  changePasswordSchema,
  emailPreferencesSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation/notifications";

const BCRYPT_ROUNDS = 12;

export type SettingsState = FormState & { message?: string };

// ---------------------------------------------------------------------------
// Settings (signed in): every action acts on the session's user only.

export async function updateAccountName(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = accountNameSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  await db.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
  refresh();
  return { ok: true, message: "Name saved." };
}

export async function updateEmailPreferences(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const { emailNotifications } = emailPreferencesSchema.parse(formToObject(formData));

  await db.user.update({ where: { id: user.id }, data: { emailNotifications } });
  refresh();
  return {
    ok: true,
    message: emailNotifications
      ? "Email notifications are on."
      : "Email notifications are off. You'll still get security emails, like password resets.",
  };
}

export async function changePassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { currentPassword, newPassword } = parsed.data;

  const account = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
    return { fieldErrors: { currentPassword: ["That isn't your current password"] } };
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const now = new Date();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    // Outstanding reset links stop working once the password changes.
    db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
  ]);
  await queueEmail({ to: user.email, ...passwordChangedEmail({ recipientName: user.name }, emailEnv()) });
  return { ok: true, message: "Password changed." };
}

/** Gives the user a new calendar feed URL; the old one stops working. */
export async function resetCalendarLink(_prev: SettingsState, _formData?: FormData): Promise<SettingsState> {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { calendarToken: generateCalendarToken() } });
  refresh();
  return {
    ok: true,
    message: "Your calendar link was reset. Subscribe again with the new link; the old one no longer works.",
  };
}

// ---------------------------------------------------------------------------
// Password reset (signed out)

/**
 * Always answers the same way, whether or not the address has an account, and
 * does the lookup after the response so timing doesn't give it away either.
 */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { email } = parsed.data;

  after(async () => {
    try {
      await sendPasswordReset(email);
    } catch (err) {
      console.error("[password-reset] could not send the reset email", err);
    }
  });
  return { ok: true };
}

async function sendPasswordReset(email: string) {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, suspendedAt: true },
  });
  if (!user || user.suspendedAt) return;

  const token = generateSecret();
  const now = new Date();
  const created = await db.$transaction(async (tx) => {
    // Lock the user row so parallel requests can't slip past the throttle.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const recent = await tx.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gt: resetThrottleSince(now) } },
    });
    if (!canSendResetEmail(recent)) return false;
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: resetTokenExpiry(now) },
    });
    return true;
  });
  if (!created) {
    console.info(`[password-reset] throttled: too many reset emails for user ${user.id} in the last hour`);
    return;
  }

  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  await queueEmail({
    to: user.email,
    ...passwordResetEmail({ recipientName: user.name, url, expiresInMinutes: RESET_TOKEN_TTL_MINUTES }, emailEnv()),
  });
}

const INVALID_LINK = "This reset link has expired or has already been used. Request a new one.";

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { token, password } = parsed.data;

  const now = new Date();
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { name: true, email: true, suspendedAt: true } } },
  });
  if (!record || resetTokenProblem(record, now) || record.user.suspendedAt) return { error: INVALID_LINK };

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const changed = await db.$transaction(async (tx) => {
    // Claim the token first: of two simultaneous submissions only one wins.
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) return false;
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    // Any other links that were emailed stop working too.
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });
  if (!changed) return { error: INVALID_LINK };

  await queueEmail({ to: record.user.email, ...passwordChangedEmail({ recipientName: record.user.name }, emailEnv()) });
  return { ok: true };
}
