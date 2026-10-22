import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_PASSWORD, type SeedContext } from "./seeds/context";
import { seedCoaching } from "./seeds/coaching";
import { seedDiscovery } from "./seeds/discovery";
import { seedMessaging } from "./seeds/messaging";
import { seedNotifications } from "./seeds/notifications";
import { seedPackages } from "./seeds/packages";
import { seedPayments } from "./seeds/payments";
import { seedReviews } from "./seeds/reviews";
import { seedScheduling } from "./seeds/scheduling";
import { seedTrust } from "./seeds/trust";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const trainers = [
  {
    name: "Maya Okafor",
    email: "maya@example.com",
    gender: "FEMALE",
    headline: "Strength coach for busy parents",
    bio: "I help parents get strong in three short sessions a week. Certified strength and conditioning specialist.",
    specialties: ["strength", "post-natal", "mobility"],
    languages: ["english"],
    city: "London",
    timezone: "Europe/London",
    yearsExperience: 9,
    sessionRateCents: 6500,
    currency: "gbp",
    offersInPerson: true,
    offersOnline: true,
    defaultLocation: "PureGym Camden, or your home in north London",
  },
  {
    name: "Diego Ramírez",
    email: "diego@example.com",
    gender: "MALE",
    headline: "Marathon and endurance training",
    bio: "Former competitive runner. Training plans for 5k to marathon, plus strength work to stay injury-free.",
    specialties: ["running", "endurance", "injury prevention"],
    languages: ["english", "spanish"],
    city: "New York",
    timezone: "America/New_York",
    yearsExperience: 12,
    sessionRateCents: 8000,
    currency: "usd",
    offersInPerson: true,
    offersOnline: true,
    defaultLocation: "Central Park, East 72nd St entrance",
  },
  {
    name: "Aiko Tanaka",
    email: "aiko@example.com",
    gender: "FEMALE",
    headline: "Online mobility and yoga-based conditioning",
    bio: "Remote sessions focused on mobility, posture and pain-free movement for desk workers.",
    specialties: ["mobility", "yoga", "posture"],
    languages: ["english", "japanese"],
    city: "",
    timezone: "Asia/Tokyo",
    yearsExperience: 6,
    sessionRateCents: 4500,
    currency: "usd",
    offersInPerson: false,
    offersOnline: true,
    defaultLocation: "",
  },
  {
    name: "Lukas Becker",
    email: "lukas@example.com",
    gender: "MALE",
    headline: "Weight loss and nutrition coaching",
    bio: "Sustainable fat loss with simple strength training and realistic nutrition habits.",
    specialties: ["weight loss", "nutrition", "strength"],
    languages: ["german", "english"],
    city: "Berlin",
    timezone: "Europe/Berlin",
    yearsExperience: 7,
    sessionRateCents: 6000,
    currency: "eur",
    offersInPerson: true,
    offersOnline: false,
    defaultLocation: "McFit Berlin-Mitte",
  },
  {
    name: "Sofia Almeida",
    email: "sofia@example.com",
    gender: "FEMALE",
    headline: "Pre- and post-natal fitness",
    bio: "Safe, confidence-building training through pregnancy and after birth. Women-only sessions available.",
    specialties: ["pre-natal", "post-natal", "pilates"],
    languages: ["portuguese", "english", "spanish"],
    city: "Lisbon",
    timezone: "Europe/Lisbon",
    yearsExperience: 10,
    sessionRateCents: 5000,
    currency: "eur",
    offersInPerson: true,
    offersOnline: true,
    defaultLocation: "Studio in Príncipe Real",
  },
  {
    name: "Omar Haddad",
    email: "omar@example.com",
    gender: "MALE",
    headline: "Boxing conditioning and HIIT",
    bio: "High-energy boxing fitness for all levels. Pads, footwork and conditioning circuits.",
    specialties: ["boxing", "hiit", "conditioning"],
    languages: ["arabic", "english", "french"],
    city: "Dubai",
    timezone: "Asia/Dubai",
    yearsExperience: 8,
    sessionRateCents: 9000,
    currency: "usd",
    offersInPerson: true,
    offersOnline: false,
    defaultLocation: "Your home or building gym in Dubai Marina",
  },
] as const;

const clients = [
  { name: "Sam Client", email: "client@example.com", gender: "UNSPECIFIED" },
  { name: "Priya Shah", email: "priya@example.com", gender: "FEMALE" },
  { name: "Tom Walker", email: "tom@example.com", gender: "MALE" },
] as const;

async function main() {
  // Demo accounts share a published password, including an admin. Never create them on a live site by accident.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to load demo data in production: every demo account, including an admin, uses the password " +
        `"${DEMO_PASSWORD}". Set ALLOW_DEMO_SEED=true if this really is a demo site, or create a real admin with ` +
        "npm run admin:create.",
    );
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const ctx: SeedContext = { db, passwordHash, trainers: {}, clients: {}, adminId: "" };

  for (const { name, email, gender, ...profile } of trainers) {
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: {
        name,
        email,
        gender,
        passwordHash,
        role: "TRAINER",
        trainerProfile: {
          create: {
            ...profile,
            specialties: [...profile.specialties],
            languages: [...profile.languages],
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
      include: { trainerProfile: { select: { id: true } } },
    });
    ctx.trainers[email] = { userId: user.id, trainerId: user.trainerProfile!.id };
  }

  for (const { name, email, gender } of clients) {
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: { name, email, gender, passwordHash, role: "CLIENT" },
    });
    ctx.clients[email] = { userId: user.id };
  }

  const admin = await db.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: { name: "Platform Admin", email: "admin@example.com", passwordHash, role: "ADMIN" },
  });
  ctx.adminId = admin.id;

  // Feature data, in dependency order.
  await seedScheduling(ctx);
  await seedPayments(ctx);
  await seedPackages(ctx);
  await seedReviews(ctx);
  await seedMessaging(ctx);
  await seedCoaching(ctx);
  await seedTrust(ctx);
  await seedDiscovery(ctx);
  await seedNotifications(ctx);

  console.log(
    `Seeded ${trainers.length} trainers, ${clients.length} clients and an admin (password: ${DEMO_PASSWORD})`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
