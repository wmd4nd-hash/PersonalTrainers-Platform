"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
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
    select: { id: true },
  });

  await createSession(user.id);
  redirect(role === "TRAINER" ? "/dashboard/profile" : "/trainers");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });
  const valid = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!valid) return { error: "Incorrect email or password" };

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
