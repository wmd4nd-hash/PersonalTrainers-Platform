/**
 * Prepares the database for the public demo before the server starts.
 *
 * - DEMO_RESET_ON_START=true: wipes everything and loads fresh demo data, so
 *   each restart (on Render's free plan, after the site has been idle) starts clean.
 * - Otherwise: loads demo data only into an empty database.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    if (process.env.DEMO_RESET_ON_START === "true") {
      const tables = await db.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      if (tables.length > 0) {
        const list = tables.map((t) => `"public"."${t.tablename.replace(/"/g, '""')}"`).join(", ");
        await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      }
      console.log("[demo] cleared the database");
    } else if ((await db.user.count()) > 0) {
      console.log("[demo] database already has data; not seeding");
      return;
    }
  } finally {
    await db.$disconnect();
  }

  const seed = spawnSync("npx", ["prisma", "db", "seed"], {
    stdio: "inherit",
    env: { ...process.env, ALLOW_DEMO_SEED: "true" },
  });
  if (seed.status !== 0) throw new Error("Seeding the demo data failed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
