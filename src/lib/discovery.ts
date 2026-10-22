import "server-only";
import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { cacheLife } from "next/cache";
import { trainerCardSelect, type TrainerCardData } from "@/components/trainer-card";
import { getBusyPeriods } from "./bookings";
import { db } from "./db";
import {
  MATCH_HORIZON_DAYS,
  MATCH_LIMIT,
  matchCandidatesWhere,
  rankMatches,
  type MatchAnswers,
  type MatchCandidate,
  type RankedMatch,
} from "./matching";
import { generateSlots } from "./scheduling";
import {
  buildTrainerQuery,
  DEFAULT_SEARCH,
  PAGE_SIZE,
  paginate,
  planGroupReads,
  trainerSearchOrder,
  visibleTrainerWhere,
  type TrainerSearch,
} from "./search";
import { appUrl } from "./stripe";

/** Data access for discovery: trainer search, quiz matches and filter choices. */

export type TrainerSearchResult = {
  trainers: TrainerCardData[];
  total: number;
  page: number;
  pageCount: number;
};

export async function searchTrainers(search: TrainerSearch, pageSize = PAGE_SIZE): Promise<TrainerSearchResult> {
  const { groups, orderBy } = buildTrainerQuery(search);
  const counts = await Promise.all(groups.map((where) => db.trainerProfile.count({ where })));
  const total = counts.reduce((sum, n) => sum + n, 0);
  const { page, pageCount, skip, take } = paginate(total, search.page, pageSize);

  const slices = await Promise.all(
    planGroupReads(counts, skip, take).map((read) =>
      db.trainerProfile.findMany({
        where: groups[read.group],
        orderBy,
        skip: read.skip,
        take: read.take,
        select: trainerCardSelect,
      }),
    ),
  );
  return { trainers: slices.flat(), total, page, pageCount };
}

/** Top-rated trainers for the home page, verified trainers first. */
export async function getFeaturedTrainers(limit = 6): Promise<TrainerCardData[]> {
  const { trainers } = await searchTrainers(DEFAULT_SEARCH, limit);
  return trainers;
}

export type FilterOptions = {
  /** Most common first. */
  specialties: string[];
  /** Alphabetical. */
  languages: string[];
};

/** Specialties and languages that published trainers list, for filters and the quiz. */
export async function getFilterOptions(): Promise<FilterOptions> {
  "use cache";
  cacheLife("minutes");

  const [specialties, languages] = await Promise.all([
    db.$queryRaw<{ value: string }[]>`
      SELECT s AS value
      FROM "TrainerProfile" t
      JOIN "User" u ON u.id = t."userId"
      CROSS JOIN LATERAL unnest(t.specialties) AS s
      WHERE t.published AND u."suspendedAt" IS NULL
      GROUP BY s
      ORDER BY count(*) DESC, s
      LIMIT 16`,
    db.$queryRaw<{ value: string }[]>`
      SELECT DISTINCT l AS value
      FROM "TrainerProfile" t
      JOIN "User" u ON u.id = t."userId"
      CROSS JOIN LATERAL unnest(t.languages) AS l
      WHERE t.published AND u."suspendedAt" IS NULL
      ORDER BY l`,
  ]);
  return { specialties: specialties.map((r) => r.value), languages: languages.map((r) => r.value) };
}

const matchSelect = {
  ...trainerCardSelect,
  timezone: true,
  minNoticeHours: true,
  availability: { select: { dayOfWeek: true, startMinute: true, endMinute: true } },
} satisfies Prisma.TrainerProfileSelect;

type MatchRow = Prisma.TrainerProfileGetPayload<{ select: typeof matchSelect }>;

type MatchTrainer = MatchCandidate & { card: TrainerCardData };

/** How many trainers we consider, and how many of the leaders we check open times for. */
const CANDIDATE_LIMIT = 200;
const AVAILABILITY_CHECKS = 20;

/** The quiz's top matches, each with plain reasons. */
export async function findMatches(answers: MatchAnswers, now: Date): Promise<RankedMatch<MatchTrainer>[]> {
  const where = matchCandidatesWhere(answers);
  const orderBy = trainerSearchOrder("rating");

  // Trainers who specialise in the goal come first, so a big catalogue can't crowd them out.
  const groups = answers.goal
    ? [
        { AND: [where, { specialties: { has: answers.goal } }] },
        { AND: [where, { NOT: { specialties: { has: answers.goal } } }] },
      ]
    : [where];
  const rows: MatchRow[] = [];
  for (const group of groups) {
    const remaining = CANDIDATE_LIMIT - rows.length;
    if (remaining <= 0) break;
    rows.push(
      ...(await db.trainerProfile.findMany({ where: group, orderBy, take: remaining, select: matchSelect })),
    );
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const candidates: MatchTrainer[] = rows.map(({ availability: _availability, timezone, minNoticeHours: _notice, ...card }) => ({
    id: card.id,
    headline: card.headline,
    specialties: card.specialties,
    languages: card.languages,
    city: card.city,
    offersInPerson: card.offersInPerson,
    offersOnline: card.offersOnline,
    sessionRateCents: card.sessionRateCents,
    verified: card.verificationStatus === "VERIFIED",
    ratingAverage: card.ratingAverage,
    ratingCount: card.ratingCount,
    yearsExperience: card.yearsExperience,
    timezone,
    card,
  }));

  // Rank without open times first, then check calendars for the leaders only.
  const leaders = rankMatches(candidates, answers, undefined, AVAILABILITY_CHECKS).map((m) => m.trainer);
  const slots = new Map(
    await Promise.all(
      leaders.map(async (trainer) => {
        const row = byId.get(trainer.id)!;
        const busy = await getBusyPeriods(trainer.id, now);
        const open = generateSlots({
          windows: row.availability,
          busy,
          timezone: row.timezone,
          sessionMinutes: row.sessionMinutes,
          now,
          days: MATCH_HORIZON_DAYS,
          minNoticeMinutes: row.minNoticeHours * 60,
        });
        return [trainer.id, open] as const;
      }),
    ),
  );

  return rankMatches(leaders, answers, (trainer) => ({ slots: slots.get(trainer.id) ?? [], now }), MATCH_LIMIT);
}

/** Title and description for a trainer's public page: name, city and headline. */
export async function trainerMetadata(id: string): Promise<Metadata> {
  const trainer = await db.trainerProfile.findFirst({
    where: { id, ...visibleTrainerWhere },
    select: { headline: true, bio: true, city: true, user: { select: { name: true } } },
  });
  if (!trainer) return { title: "Trainer not found", robots: { index: false } };

  const name = trainer.user.name;
  const title = trainer.city ? `${name}, personal trainer in ${trainer.city}` : `${name}, online personal trainer`;
  const about = [trainer.headline.replace(/[.!?]\s*$/, ""), trainer.bio].filter(Boolean).join(". ").replace(/\s+/g, " ");
  const description = about.length > 160 ? `${about.slice(0, 157).trimEnd()}…` : about || title;
  const url = appUrl(`/trainers/${id}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "profile", url },
  };
}
