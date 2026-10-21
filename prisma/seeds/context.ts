import type { PrismaClient } from "../../src/generated/prisma/client";

export type SeedContext = {
  db: PrismaClient;
  /** bcrypt hash of DEMO_PASSWORD */
  passwordHash: string;
  /** Demo trainers keyed by email, with their profile ids. */
  trainers: Record<string, { userId: string; trainerId: string }>;
  /** Demo clients keyed by email. */
  clients: Record<string, { userId: string }>;
  adminId: string;
};

export const DEMO_PASSWORD = "password123";
