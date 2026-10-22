import type { Gender, Prisma } from "@/generated/prisma/client";

/** Trainer search on /trainers: filters, sorting and paging, as pure functions. */

export const PAGE_SIZE = 12;

export const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "rating", label: "Highest rated" },
  { value: "price", label: "Price: low to high" },
  { value: "experience", label: "Most experienced" },
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export const FORMAT_OPTIONS = [
  { value: "in-person", label: "In person" },
  { value: "online", label: "Online" },
] as const;
export type FormatFilter = (typeof FORMAT_OPTIONS)[number]["value"];

export const GENDER_OPTIONS = [
  { value: "female", label: "Female", gender: "FEMALE" },
  { value: "male", label: "Male", gender: "MALE" },
  { value: "non-binary", label: "Non-binary", gender: "NON_BINARY" },
] as const satisfies readonly { value: string; label: string; gender: Gender }[];
export type GenderFilter = (typeof GENDER_OPTIONS)[number]["value"];

export const MIN_RATING_OPTIONS = [4.5, 4, 3] as const;
export type MinRating = (typeof MIN_RATING_OPTIONS)[number];

export type TrainerSearch = {
  /** Matches the trainer's name, headline or a specialty. */
  q?: string;
  city?: string;
  format?: FormatFilter;
  /** Highest price per session, in the trainer's currency. */
  maxPriceCents?: number;
  gender?: GenderFilter;
  /** Lowercase, e.g. "spanish". */
  language?: string;
  verifiedOnly: boolean;
  minRating?: MinRating;
  sort: SortOption;
  page: number;
};

export const DEFAULT_SEARCH: TrainerSearch = { verifiedOnly: false, sort: "recommended", page: 1 };

/** Trainers anyone may see: published, and their account isn't suspended. */
export const visibleTrainerWhere = {
  published: true,
  user: { suspendedAt: null },
} satisfies Prisma.TrainerProfileWhereInput;

export function genderOf(filter: GenderFilter): Gender {
  return GENDER_OPTIONS.find((g) => g.value === filter)!.gender;
}

const ACRONYMS: Record<string, string> = { hiit: "HIIT", trx: "TRX" };

/** "post-natal" -> "Post-natal", "hiit" -> "HIIT". For specialties and languages. */
export function tagLabel(tag: string) {
  return ACRONYMS[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1);
}

/** A specialty inside a sentence: "running", but "HIIT". */
export function tagInSentence(tag: string) {
  return ACRONYMS[tag] ?? tag;
}

/** "75" for 7500 cents, "75.50" for 7550. */
export function formatAmount(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function textQueryWhere(q: string): Prisma.TrainerProfileWhereInput {
  const lower = q.toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 1);
  return {
    OR: [
      { user: { name: { contains: q, mode: "insensitive" } } },
      { headline: { contains: q, mode: "insensitive" } },
      { specialties: { has: lower } },
      // "strength coach" still finds strength trainers.
      ...(words.length > 1 ? [{ specialties: { hasSome: words } }] : []),
    ],
  };
}

/** Every filter in the search, combined. Always limited to visible trainers. */
export function trainerSearchWhere(search: TrainerSearch): Prisma.TrainerProfileWhereInput {
  const and: Prisma.TrainerProfileWhereInput[] = [visibleTrainerWhere];
  if (search.q) and.push(textQueryWhere(search.q));
  if (search.city) and.push({ city: { contains: search.city, mode: "insensitive" } });
  if (search.format === "in-person") and.push({ offersInPerson: true });
  if (search.format === "online") and.push({ offersOnline: true });
  if (search.maxPriceCents !== undefined) and.push({ sessionRateCents: { lte: search.maxPriceCents } });
  if (search.gender) and.push({ user: { gender: genderOf(search.gender) } });
  if (search.language) and.push({ languages: { has: search.language } });
  if (search.verifiedOnly) and.push({ verificationStatus: "VERIFIED" });
  if (search.minRating !== undefined) {
    and.push({ ratingCount: { gt: 0 }, ratingAverage: { gte: search.minRating } });
  }
  return { AND: and };
}

/** Ties always fall back to the id so pages never repeat or skip a trainer. */
export function trainerSearchOrder(sort: SortOption): Prisma.TrainerProfileOrderByWithRelationInput[] {
  switch (sort) {
    case "price":
      return [{ sessionRateCents: "asc" }, { ratingAverage: "desc" }, { id: "asc" }];
    case "experience":
      return [{ yearsExperience: "desc" }, { ratingAverage: "desc" }, { id: "asc" }];
    case "rating":
    case "recommended":
      return [{ ratingAverage: "desc" }, { ratingCount: "desc" }, { yearsExperience: "desc" }, { id: "asc" }];
  }
}

export type TrainerQuery = {
  /**
   * Result groups, listed one after another. "Recommended" shows verified
   * trainers before everyone else; other sorts use a single group.
   */
  groups: Prisma.TrainerProfileWhereInput[];
  orderBy: Prisma.TrainerProfileOrderByWithRelationInput[];
};

export function buildTrainerQuery(search: TrainerSearch): TrainerQuery {
  const where = trainerSearchWhere(search);
  const orderBy = trainerSearchOrder(search.sort);
  if (search.sort !== "recommended" || search.verifiedOnly) return { groups: [where], orderBy };
  return {
    groups: [
      { AND: [where, { verificationStatus: "VERIFIED" }] },
      { AND: [where, { verificationStatus: { not: "VERIFIED" } }] },
    ],
    orderBy,
  };
}

export type PageWindow = { page: number; pageCount: number; skip: number; take: number };

/** Clamps the requested page to the results, so a stale link shows the last page. */
export function paginate(total: number, requestedPage: number, pageSize = PAGE_SIZE): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);
  return { page, pageCount, skip: (page - 1) * pageSize, take: pageSize };
}

export type GroupRead = { group: number; skip: number; take: number };

/** Which slice of each result group makes up one page, given each group's size. */
export function planGroupReads(counts: number[], skip: number, take: number): GroupRead[] {
  const reads: GroupRead[] = [];
  let offset = skip;
  let remaining = take;
  counts.forEach((count, group) => {
    if (remaining <= 0) return;
    if (offset >= count) {
      offset -= count;
      return;
    }
    const n = Math.min(count - offset, remaining);
    reads.push({ group, skip: offset, take: n });
    remaining -= n;
    offset = 0;
  });
  return reads;
}

/** The search as URL params, leaving out defaults so links stay short. */
export function searchParamsOf(search: TrainerSearch): URLSearchParams {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.city) params.set("city", search.city);
  if (search.format) params.set("format", search.format);
  if (search.maxPriceCents !== undefined) params.set("maxPrice", formatAmount(search.maxPriceCents));
  if (search.gender) params.set("gender", search.gender);
  if (search.language) params.set("language", search.language);
  if (search.verifiedOnly) params.set("verified", "1");
  if (search.minRating !== undefined) params.set("minRating", String(search.minRating));
  if (search.sort !== "recommended") params.set("sort", search.sort);
  if (search.page > 1) params.set("page", String(search.page));
  return params;
}

/** Link to /trainers with some of the search changed. Goes back to page 1 unless a page is given. */
export function trainersHref(search: TrainerSearch, changes: Partial<TrainerSearch> = {}) {
  const query = searchParamsOf({ ...search, page: 1, ...changes }).toString();
  return query ? `/trainers?${query}` : "/trainers";
}

export type FilterChip = { key: keyof TrainerSearch; label: string; href: string };

/** One removable chip per active filter, in the order the filters panel lists them. */
export function activeFilters(search: TrainerSearch): FilterChip[] {
  const chips: FilterChip[] = [];
  const add = (key: keyof TrainerSearch, label: string) =>
    chips.push({ key, label, href: trainersHref(search, { [key]: key === "verifiedOnly" ? false : undefined }) });

  if (search.q) add("q", `“${search.q}”`);
  if (search.city) add("city", `In ${search.city}`);
  if (search.format) add("format", FORMAT_OPTIONS.find((f) => f.value === search.format)!.label);
  if (search.maxPriceCents !== undefined) add("maxPriceCents", `Up to ${formatAmount(search.maxPriceCents)} a session`);
  if (search.gender) add("gender", `${GENDER_OPTIONS.find((g) => g.value === search.gender)!.label} trainers`);
  if (search.language) add("language", `Speaks ${tagLabel(search.language)}`);
  if (search.verifiedOnly) add("verifiedOnly", "Verified only");
  if (search.minRating !== undefined) add("minRating", `${search.minRating}+ stars`);
  return chips;
}

export function describeCount(total: number) {
  if (total === 0) return "No trainers found";
  return total === 1 ? "1 trainer" : `${total} trainers`;
}
