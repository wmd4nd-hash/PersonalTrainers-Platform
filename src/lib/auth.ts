import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSession } from "./session";
import type { Role } from "@/generated/prisma/client";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarFileId: string | null;
};

/** Returns the signed-in user, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const { userId } = await getSession();
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, avatarFileId: true, suspendedAt: true },
  });
  // Suspended accounts are treated as signed out.
  if (!user || user.suspendedAt) return null;
  const { suspendedAt: _suspendedAt, ...current } = user;
  return current;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  return requireRole("ADMIN");
}

/** The signed-in trainer's profile id. Every trainer has a profile from signup. */
export async function requireTrainerProfileId(): Promise<string> {
  const user = await requireRole("TRAINER");
  const profile = await db.trainerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) redirect("/dashboard");
  return profile.id;
}
