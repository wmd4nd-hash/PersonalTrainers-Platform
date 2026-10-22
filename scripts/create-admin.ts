/**
 * Creates an admin account, or makes an existing account an admin.
 *
 *   ADMIN_PASSWORD='a long password' npm run admin:create -- admin@yourdomain.com "Your Name"
 *
 * The password comes from the environment so it doesn't end up in shell history.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const [rawEmail, ...nameParts] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  const name = nameParts.join(" ").trim() || "Admin";
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Usage: ADMIN_PASSWORD=... npm run admin:create -- admin@example.com "Full Name"');
  }
  if (password.length < 12) throw new Error("Set ADMIN_PASSWORD to at least 12 characters.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (existing?.role === "TRAINER") {
      throw new Error(`${email} is a trainer account. Use a separate email for the admin.`);
    }
    await db.user.upsert({
      where: { email },
      // Signs out any existing sessions for this account.
      update: { role: "ADMIN", passwordHash, suspendedAt: null, sessionVersion: { increment: 1 } },
      create: { email, name, role: "ADMIN", passwordHash },
    });
    console.log(`${existing ? "Updated" : "Created"} admin ${email}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
