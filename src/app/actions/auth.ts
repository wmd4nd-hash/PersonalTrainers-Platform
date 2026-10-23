"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isProtectedDemoAccount } from "@/lib/demo";
import {
  lockedMessage,
  lockExpired,
  lockMinutesLeft,
  lockUntil,
  shouldCheckPassword,
  shouldLock,
} from "@/lib/login-throttle";
import { createSession, destroySession } from "@/lib/session";
import {
  fieldErrorsOf,
  formToObject,
  loginSchema,
  signupSchema,
  type FormState,
} from "@/lib/validation";

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { name, email, password, role } = parsed.data;

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { fieldErrors: { email: ["An account with this email already exists"] } };
  }

  const user = await db.user.create({
    data: {
      name,
      email,
      role,
      passwordHash: await bcrypt.hash(password, 12),
      trainerProfile: role === "TRAINER" ? { create: {} } : undefined,
    },
    select: { id: true, sessionVersion: true },
  });

  await createSession(user.id, user.sessionVersion);
  redirect(role === "TRAINER" ? "/dashboard/profile" : "/trainers");
}

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = "$2b$12$ADiGxl8/9qYA2Fo005SBF.e1HXKhskTNOF.rNU4F9LUrdcK9aItTq";

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      passwordHash: true,
      role: true,
      suspendedAt: true,
      sessionVersion: true,
      failedLoginCount: true,
      loginLockedUntil: true,
    },
  });
  if (!user) {
    // Same work and answer as a wrong password, so emails can't be probed.
    await bcrypt.compare(parsed.data.password, DUMMY_HASH);
    return { error: "Incorrect email or password" };
  }

  // Shared demo accounts have a published password; locking them would just lock everyone out.
  if (isProtectedDemoAccount(parsed.data.email)) {
    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) return { error: "Incorrect email or password" };
    if (user.suspendedAt) return { error: "This account has been suspended. Contact support." };
    await createSession(user.id, user.sessionVersion);
    redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  const now = new Date();
  const lockedFor = lockMinutesLeft(user, now);
  if (lockedFor > 0) return { error: lockedMessage(lockedFor) };
  if (lockExpired(user, now)) {
    await db.user.updateMany({
      where: { id: user.id, loginLockedUntil: user.loginLockedUntil },
      data: { failedLoginCount: 0, loginLockedUntil: null },
    });
  }

  // Count the attempt before checking the password, atomically, so guesses
  // sent in parallel still only get a few tries.
  const { failedLoginCount: attempt } = await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (!shouldCheckPassword(attempt)) return { error: lockedMessage() };

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    if (shouldLock(attempt)) {
      await db.user.update({ where: { id: user.id }, data: { loginLockedUntil: lockUntil(now) } });
      return { error: lockedMessage() };
    }
    return { error: "Incorrect email or password" };
  }
  if (user.suspendedAt) return { error: "This account has been suspended. Contact support." };

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, loginLockedUntil: null } });
  await createSession(user.id, user.sessionVersion);
  redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
