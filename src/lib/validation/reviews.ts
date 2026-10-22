import { z } from "zod";
import { MAX_COMMENT_LENGTH, MAX_REPLY_LENGTH, parsePage } from "../reviews";

export const reviewSchema = z.object({
  rating: z.coerce
    .number("Choose a star rating")
    .int("Choose a star rating")
    .min(1, "Choose a star rating")
    .max(5, "Choose a star rating"),
  comment: z
    .string()
    .trim()
    .max(MAX_COMMENT_LENGTH, `Keep your review under ${MAX_COMMENT_LENGTH} characters`)
    .default(""),
});

export const replySchema = z.object({
  reply: z
    .string()
    .trim()
    .min(1, "Write a reply")
    .max(MAX_REPLY_LENGTH, `Keep your reply under ${MAX_REPLY_LENGTH} characters`),
});

type SearchParams = Record<string, string | string[] | undefined>;

export type ReviewVisibilityFilter = "all" | "visible" | "hidden";

export type AdminReviewFilters = {
  visibility: ReviewVisibilityFilter;
  /** 1-5, or null for any rating. */
  rating: number | null;
  page: number;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the admin moderation filters from search params, ignoring anything unexpected. */
export function parseAdminReviewFilters(params: SearchParams): AdminReviewFilters {
  const visibility = first(params.show);
  const rating = Number(first(params.rating));
  return {
    visibility: visibility === "visible" || visibility === "hidden" ? visibility : "all",
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    page: parsePage(params.page),
  };
}

/** Search params for a filtered admin list, leaving out defaults so URLs stay short. */
export function adminReviewQuery(filters: AdminReviewFilters, page = filters.page): string {
  const query = new URLSearchParams();
  if (filters.visibility !== "all") query.set("show", filters.visibility);
  if (filters.rating) query.set("rating", String(filters.rating));
  if (page > 1) query.set("page", String(page));
  const s = query.toString();
  return s ? `?${s}` : "";
}
