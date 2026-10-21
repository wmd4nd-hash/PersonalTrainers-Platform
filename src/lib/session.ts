import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { sealData, unsealData } from "iron-session";
import { SESSION_COOKIE } from "./session-cookie";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export type SessionData = {
  userId?: string;
};

function password() {
  const value = process.env.SESSION_PASSWORD;
  if (!value || value.length < 32) {
    throw new Error("SESSION_PASSWORD must be set and at least 32 characters");
  }
  return value;
}

export async function getSession(): Promise<SessionData> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return {};
  // Unsealing checks the expiry against the clock, so it must run at request time.
  await connection();
  try {
    return await unsealData<SessionData>(cookie, {
      password: password(),
      ttl: SESSION_TTL_SECONDS,
    });
  } catch {
    return {};
  }
}

export async function createSession(userId: string) {
  const sealed = await sealData({ userId } satisfies SessionData, {
    password: password(),
    ttl: SESSION_TTL_SECONDS,
  });
  (await cookies()).set(SESSION_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
