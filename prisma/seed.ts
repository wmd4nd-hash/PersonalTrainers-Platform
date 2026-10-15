import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_PASSWORD = "password123";

const trainers = [
  {
    name: "Maya Okafor",
    email: "maya@example.com",
    headline: "Strength coach for busy parents",
    bio: "I help parents get strong in three short sessions a week. Certified strength and conditioning specialist.",
    specialties: ["strength", "post-natal", "mobility"],
    city: "London",
    timezone: "Europe/London",
    yearsExperience: 9,
    sessionRateCents: 6500,
    currency: "gbp",
  },
  {
    name: "Diego Ramírez",
    email: "diego@example.com",
    headline: "Marathon and endurance training",
    bio: "Former competitive runner. Training plans for 5k to marathon, plus strength work to stay injury-free.",
    specialties: ["running", "endurance", "injury prevention"],
    city: "New York",
    timezone: "America/New_York",
    yearsExperience: 12,
    sessionRateCents: 8000,
    currency: "usd",
  },
  {
    name: "Aiko Tanaka",
    email: "aiko@example.com",
    headline: "Online mobility and yoga-based conditioning",
    bio: "Remote sessions focused on mobility, posture and pain-free movement for desk workers.",
    specialties: ["mobility", "yoga", "posture"],
    city: "",
    timezone: "Asia/Tokyo",
    yearsExperience: 6,
    sessionRateCents: 4500,
    currency: "usd",
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const { name, email, ...profile } of trainers) {
    await db.user.upsert({
      where: { email },
      update: {},
      create: {
        name,
        email,
        passwordHash,
        role: "TRAINER",
        trainerProfile: {
          create: {
            ...profile,
            published: true,
            // Weekdays 07:00–12:00 and 16:00–19:00, Saturday morning.
            availability: {
              create: [
                ...[1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
                  { dayOfWeek, startMinute: 7 * 60, endMinute: 12 * 60 },
                  { dayOfWeek, startMinute: 16 * 60, endMinute: 19 * 60 },
                ]),
                { dayOfWeek: 6, startMinute: 8 * 60, endMinute: 11 * 60 },
              ],
            },
          },
        },
      },
    });
  }

  await db.user.upsert({
    where: { email: "client@example.com" },
    update: {},
    create: { name: "Sam Client", email: "client@example.com", passwordHash, role: "CLIENT" },
  });

  console.log(`Seeded ${trainers.length} trainers and 1 client (password: ${DEMO_PASSWORD})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
