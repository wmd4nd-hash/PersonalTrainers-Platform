import { addDays, addHours, addMinutes, setHours, startOfHour, subDays } from "date-fns";
import { platformFeeCents } from "../../src/lib/fees";
import { recomputeTrainerRating } from "../../src/lib/reviews";
import { meetingUrlFor } from "../../src/lib/sessions";
import type { SeedContext } from "./context";

/** Extra demo clients so trainer pages show reviews from a realistic mix of people. */
const reviewers = [
  { name: "Hannah Lee", email: "hannah@example.com", gender: "FEMALE" },
  { name: "Marcus Brown", email: "marcus@example.com", gender: "MALE" },
  { name: "Elena García", email: "elena@example.com", gender: "FEMALE" },
  { name: "Jamal Idris", email: "jamal@example.com", gender: "MALE" },
  { name: "Chloé Martin", email: "chloe@example.com", gender: "FEMALE" },
] as const;

type SeedReview = {
  /** Reviewer's email: one of the demo clients or `reviewers` above. */
  by: string;
  daysAgo: number;
  rating: number;
  comment: string;
  reply?: string;
  hidden?: boolean;
};

const reviewsByTrainer: Record<string, SeedReview[]> = {
  "maya@example.com": [
    {
      by: "priya@example.com",
      daysAgo: 150,
      rating: 5,
      comment:
        "Maya got me back to deadlifting six months after my second baby. She checks in on how I slept before every session and adjusts the plan. I've never felt this strong.",
      reply: "Thank you Priya! Watching you pull 80 kg last month was a highlight of my year.",
    },
    {
      by: "hannah@example.com",
      daysAgo: 120,
      rating: 5,
      comment: "Sessions are short, focused and fit around nursery pickup. Exactly what I needed.",
    },
    {
      by: "tom@example.com",
      daysAgo: 96,
      rating: 4,
      comment:
        "Really knowledgeable and patient with my dodgy shoulder. Only downside is the gym gets busy at 7am, so we sometimes waited for a rack.",
      reply: "Thanks Tom. We've moved your sessions to 7:30, when the racks are usually free.",
    },
    {
      by: "priya@example.com",
      daysAgo: 70,
      rating: 5,
      comment: "Second block of sessions with Maya and still loving it. The mobility warm-ups have fixed my back pain.",
    },
    {
      by: "marcus@example.com",
      daysAgo: 41,
      rating: 3,
      comment:
        "Good coach, but the plan was a bit too gentle for me. I wanted to push harder. Probably better suited to beginners.",
      reply:
        "Thanks for the honest feedback, Marcus. I start everyone conservatively for the first few weeks, but I should have explained that better. Happy to ramp things up next time.",
    },
    {
      by: "elena@example.com",
      daysAgo: 23,
      rating: 5,
      comment: "Came to Maya after a C-section and was nervous about lifting anything. She made me feel safe and capable.",
    },
    {
      by: "hannah@example.com",
      daysAgo: 9,
      rating: 4,
      comment: "Online session this time. Worked surprisingly well with just a kettlebell at home.",
    },
  ],
  "diego@example.com": [
    {
      by: "tom@example.com",
      daysAgo: 170,
      rating: 5,
      comment: "Diego took me from couch to my first half marathon in 14 weeks. Smart, structured and very encouraging.",
      reply: "So proud of you, Tom. 1:52 on your first half is a great result!",
    },
    {
      by: "jamal@example.com",
      daysAgo: 140,
      rating: 4,
      comment: "Great running drills in the park. Bring layers in winter, it's cold standing around between intervals.",
    },
    {
      by: "client@example.com",
      daysAgo: 110,
      rating: 5,
      comment: "Finally fixed my overstriding. My knees thank you.",
    },
    {
      by: "chloe@example.com",
      daysAgo: 88,
      rating: 5,
      comment:
        "Diego's strength routine for runners is gold. Two months in and no more shin splints, plus I took four minutes off my 10k.",
    },
    {
      by: "marcus@example.com",
      daysAgo: 64,
      rating: 2,
      comment: "He was 15 minutes late and we ran out of time for the strength part. The running advice itself was solid.",
      reply:
        "Marcus, I'm sorry about that. The subway was down, but I should have messaged you sooner. I've added a free extra session to make up for it.",
    },
    {
      by: "tom@example.com",
      daysAgo: 45,
      rating: 4,
      comment: "Marathon block going well. Long runs feel manageable now.",
    },
    {
      by: "elena@example.com",
      daysAgo: 20,
      rating: 5,
      comment: "Explained everything in Spanish and English for me and my partner. Very patient and fun.",
    },
    {
      by: "jamal@example.com",
      daysAgo: 7,
      rating: 5,
      comment: "Race-day plan was perfect. Negative split and a PB!",
    },
  ],
  "aiko@example.com": [
    {
      by: "client@example.com",
      daysAgo: 130,
      rating: 5,
      comment: "My neck pain from working at a laptop all day is nearly gone. Aiko's routines take 15 minutes and actually work.",
      reply: "That's wonderful to hear! Keep up the daily thoracic openers.",
    },
    {
      by: "chloe@example.com",
      daysAgo: 80,
      rating: 4,
      comment: "Calm, precise instruction over video. A couple of sessions had a laggy connection on my end, but she adapted well.",
    },
    {
      by: "hannah@example.com",
      daysAgo: 52,
      rating: 5,
      comment: "The best online sessions I've tried. She notices tiny things in your posture even through a webcam.",
    },
    {
      by: "jamal@example.com",
      daysAgo: 18,
      rating: 4,
      comment: "Good mix of yoga and strength. I'd love a little more variety week to week.",
      reply: "Thanks Jamal, I'll add a new flow to your plan each week from now on.",
    },
  ],
  "lukas@example.com": [
    {
      by: "marcus@example.com",
      daysAgo: 160,
      rating: 4,
      comment: "Down 9 kg in four months without giving up beer entirely. Lukas keeps the nutrition advice realistic.",
      reply: "Balance is everything! Great work, Marcus.",
    },
    {
      by: "elena@example.com",
      daysAgo: 115,
      rating: 3,
      comment: "Knows his stuff, but the gym in Mitte is very crowded in the evenings and it was hard to get equipment.",
    },
    {
      by: "tom@example.com",
      daysAgo: 77,
      rating: 5,
      comment: "Simple plan, weekly check-ins, steady results. Exactly what I was looking for.",
    },
    {
      by: "jamal@example.com",
      daysAgo: 38,
      rating: 4,
      comment: "Friendly and direct. The meal-prep tips alone were worth it.",
    },
    {
      by: "chloe@example.com",
      daysAgo: 12,
      rating: 2,
      comment: "Felt a bit rushed and generic. I expected a more personal plan for the price.",
      reply:
        "Thanks for telling me, Chloé. I'd like to sit down and build your plan around your schedule properly. I'll send you a message.",
    },
  ],
  "sofia@example.com": [
    {
      by: "priya@example.com",
      daysAgo: 165,
      rating: 5,
      comment: "Trained with Sofia through my whole pregnancy. She always knew what was safe and what to skip that week.",
      reply: "It was a joy to train with you, Priya. Congratulations again!",
    },
    {
      by: "elena@example.com",
      daysAgo: 125,
      rating: 5,
      comment: "The studio is calm and private, and Sofia speaks Spanish too. I felt completely at ease.",
    },
    {
      by: "hannah@example.com",
      daysAgo: 92,
      rating: 5,
      comment: "Pilates-based sessions helped my diastasis recti more than anything else I tried.",
    },
    {
      by: "chloe@example.com",
      daysAgo: 60,
      rating: 4,
      comment: "Lovely sessions. Booking slots fill up fast, so plan ahead.",
    },
    {
      by: "priya@example.com",
      daysAgo: 33,
      rating: 5,
      comment: "Back for post-natal sessions and they are just as good. Gentle but challenging.",
    },
    {
      by: "elena@example.com",
      daysAgo: 6,
      rating: 5,
      comment: "Sofia remembers every detail about your body and history. Highly recommend.",
    },
  ],
  "omar@example.com": [
    {
      by: "jamal@example.com",
      daysAgo: 100,
      rating: 5,
      comment: "Pad work with Omar is the most fun I've had exercising. Sweaty, loud and brilliant.",
      reply: "Your jab is getting sharp, Jamal. See you Thursday!",
    },
    {
      by: "marcus@example.com",
      daysAgo: 66,
      rating: 4,
      comment: "Intense HIIT circuits right in my building gym. Very convenient. Warm-ups could be longer.",
    },
    {
      by: "tom@example.com",
      daysAgo: 30,
      rating: 3,
      comment: "Good energy, but too advanced for a total beginner like me. I struggled to keep up.",
    },
    {
      // Moderation demo: hidden for sharing contact details to take sessions off the platform.
      by: "chloe@example.com",
      daysAgo: 14,
      rating: 5,
      comment: "Great trainer! Message me on +971 55 123 4567 and we can split sessions cheaper outside the app.",
      hidden: true,
    },
  ],
};

/** Demo data for the reviews feature. Must be safe to run more than once. */
export async function seedReviews(ctx: SeedContext) {
  const { db } = ctx;
  const now = new Date();

  const people: Record<string, string> = Object.fromEntries(
    Object.entries(ctx.clients).map(([email, { userId }]) => [email, userId]),
  );
  for (const { name, email, gender } of reviewers) {
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: { name, email, gender, passwordHash: ctx.passwordHash, role: "CLIENT" },
      select: { id: true },
    });
    people[email] = user.id;
  }

  for (const [trainerEmail, reviews] of Object.entries(reviewsByTrainer)) {
    const ids = ctx.trainers[trainerEmail];
    if (!ids) continue;
    const trainer = await db.trainerProfile.findUniqueOrThrow({ where: { id: ids.trainerId } });
    const key = trainerEmail.split("@")[0];
    const seenClients = new Set<string>();

    for (const [i, r] of reviews.entries()) {
      const clientId = people[r.by];
      if (!clientId) throw new Error(`Unknown demo reviewer ${r.by}`);
      const bookingId = `seed-reviews-${key}-${i + 1}`;
      const isNewClient = !seenClients.has(clientId);
      seenClients.add(clientId);

      const startsAt = sessionStart(now, r.daysAgo, i);
      const endsAt = addMinutes(startsAt, trainer.sessionMinutes);
      const online = !trainer.offersInPerson;
      await db.booking.upsert({
        where: { id: bookingId },
        update: {},
        create: {
          id: bookingId,
          trainerId: trainer.id,
          clientId,
          startsAt,
          endsAt,
          status: "COMPLETED",
          completedAt: addHours(endsAt, 2),
          format: online ? "ONLINE" : "IN_PERSON",
          location: online ? "" : trainer.defaultLocation,
          meetingUrl: online ? meetingUrlFor(trainer, bookingId) : null,
          priceCents: trainer.sessionRateCents,
          currency: trainer.currency,
          platformFeeCents: platformFeeCents(trainer.sessionRateCents, { isNewClient }),
          ...simulatedPayment(bookingId, startsAt),
        },
      });

      const createdAt = addDays(endsAt, 1 + (i % 3));
      await db.review.upsert({
        where: { bookingId },
        update: {},
        create: {
          id: `seed-review-${key}-${i + 1}`,
          bookingId,
          trainerId: trainer.id,
          clientId,
          rating: r.rating,
          comment: r.comment,
          trainerReply: r.reply ?? "",
          repliedAt: r.reply ? addHours(createdAt, 20) : null,
          hidden: r.hidden ?? false,
          createdAt,
        },
      });
    }
  }

  // A completed session the demo client hasn't reviewed yet, so "Leave a review" has something to show.
  const maya = ctx.trainers["maya@example.com"];
  const demoClient = ctx.clients["client@example.com"];
  if (maya && demoClient) {
    const trainer = await db.trainerProfile.findUniqueOrThrow({ where: { id: maya.trainerId } });
    const startsAt = sessionStart(now, 4, 0);
    const endsAt = addMinutes(startsAt, trainer.sessionMinutes);
    await db.booking.upsert({
      where: { id: "seed-reviews-maya-open" },
      update: {},
      create: {
        id: "seed-reviews-maya-open",
        trainerId: trainer.id,
        clientId: demoClient.userId,
        startsAt,
        endsAt,
        status: "COMPLETED",
        completedAt: addHours(endsAt, 1),
        format: "IN_PERSON",
        location: trainer.defaultLocation,
        priceCents: trainer.sessionRateCents,
        currency: trainer.currency,
        platformFeeCents: platformFeeCents(trainer.sessionRateCents, { isNewClient: true }),
        ...simulatedPayment("seed-reviews-maya-open", startsAt),
      },
    });
  }

  for (const { trainerId } of Object.values(ctx.trainers)) {
    await db.$transaction((tx) => recomputeTrainerRating(tx, trainerId));
  }
}

/** Paid by card a few days ahead, the way simulated checkout records it. */
function simulatedPayment(bookingId: string, startsAt: Date) {
  return { stripePaymentIntentId: `pi_sim_${bookingId}`, createdAt: subDays(startsAt, 3) };
}

/** A morning slot `daysAgo` days back, staggered so a trainer's sessions don't overlap. */
function sessionStart(now: Date, daysAgo: number, index: number) {
  return startOfHour(setHours(subDays(now, daysAgo), 8 + (index % 4)));
}
