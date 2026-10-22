import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { setReviewHidden } from "@/app/actions/reviews";
import { newestFirst } from "@/app/trainers/[id]/reviews/_components/data";
import { Pagination } from "@/app/trainers/[id]/reviews/_components/pagination";
import { ReviewCard } from "@/app/trainers/[id]/reviews/_components/review-card";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, PageHeader, Select, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { paginate, RATINGS, reviewCountLabel } from "@/lib/reviews";
import { adminReviewQuery, parseAdminReviewFilters, type AdminReviewFilters } from "@/lib/validation/reviews";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Reviews" };

const PER_PAGE = 20;

export default function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Hidden reviews disappear from trainer profiles and don't count toward ratings. You can restore them at any time."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <AdminReviews searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AdminReviews({ searchParams }: Pick<PageProps<"/admin/reviews">, "searchParams">) {
  await requireAdmin();
  const filters = parseAdminReviewFilters(await searchParams);

  const where: Prisma.ReviewWhereInput = {
    hidden: filters.visibility === "all" ? undefined : filters.visibility === "hidden",
    rating: filters.rating ?? undefined,
  };
  const total = await db.review.count({ where });
  const pager = paginate(total, filters.page, PER_PAGE);
  const reviews = await db.review.findMany({
    where,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      trainerReply: true,
      repliedAt: true,
      hidden: true,
      client: { select: { name: true, email: true } },
      trainer: { select: { id: true, timezone: true, user: { select: { name: true } } } },
    },
    orderBy: newestFirst,
    skip: pager.skip,
    take: pager.take,
  });
  const filtered = filters.visibility !== "all" || filters.rating !== null;

  return (
    <div className="space-y-4">
      <FilterForm filters={filters} />
      <p className="text-sm text-subtle" aria-live="polite">
        {reviewCountLabel(total)}
        {filtered && " match these filters"}
      </p>

      {reviews.length === 0 ? (
        <Card className="text-sm text-subtle">
          {filtered ? (
            <>
              No reviews match these filters.{" "}
              <Link href="/admin/reviews" className="font-medium text-brand">
                Clear filters
              </Link>
            </>
          ) : (
            "No reviews yet."
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <Card className={review.hidden ? "border-dashed" : undefined}>
                <ReviewCard
                  review={review}
                  authorName={review.client.name}
                  trainerName={review.trainer.user.name}
                  timezone={review.trainer.timezone}
                  meta={
                    <>
                      {review.client.email} · for{" "}
                      <Link href={`/trainers/${review.trainer.id}`} className="hover:underline">
                        {review.trainer.user.name}
                      </Link>
                    </>
                  }
                  badges={
                    review.hidden && (
                      <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Hidden</Badge>
                    )
                  }
                >
                  <form action={setReviewHidden.bind(null, review.id, !review.hidden)}>
                    <SubmitButton variant={review.hidden ? "secondary" : "danger"} pendingText="Saving…">
                      {review.hidden ? "Unhide" : "Hide"}
                    </SubmitButton>
                  </form>
                </ReviewCard>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Pagination pager={pager} hrefFor={(n) => `/admin/reviews${adminReviewQuery(filters, n)}`} />
    </div>
  );
}

function FilterForm({ filters }: { filters: AdminReviewFilters }) {
  return (
    <Form action="/admin/reviews" className="flex flex-wrap items-end gap-3">
      <div className="w-full space-y-1 sm:w-44">
        <label htmlFor="show" className="block text-sm font-medium">
          Show
        </label>
        <Select id="show" name="show" defaultValue={filters.visibility}>
          <option value="all">All reviews</option>
          <option value="visible">Visible only</option>
          <option value="hidden">Hidden only</option>
        </Select>
      </div>
      <div className="w-full space-y-1 sm:w-44">
        <label htmlFor="rating" className="block text-sm font-medium">
          Rating
        </label>
        <Select id="rating" name="rating" defaultValue={filters.rating ? String(filters.rating) : ""}>
          <option value="">Any rating</option>
          {RATINGS.map((r) => (
            <option key={r} value={r}>
              {r} {r === 1 ? "star" : "stars"}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary">
        Apply filters
      </Button>
    </Form>
  );
}
