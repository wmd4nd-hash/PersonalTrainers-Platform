import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutoSubmitSelect } from "@/components/discovery/auto-submit-select";
import { FiltersPanel } from "@/components/discovery/filters-panel";
import { GetForm } from "@/components/discovery/get-form";
import { TrainerCard, TrainerCardSkeleton } from "@/components/trainer-card";
import { Button, Card, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { getFilterOptions, searchTrainers } from "@/lib/discovery";
import {
  activeFilters,
  describeCount,
  formatAmount,
  FORMAT_OPTIONS,
  GENDER_OPTIONS,
  MIN_RATING_OPTIONS,
  SORT_OPTIONS,
  searchParamsOf,
  tagLabel,
  trainersHref,
  type TrainerSearch,
} from "@/lib/search";
import { parseTrainerSearch } from "@/lib/validation/discovery";

export const metadata: Metadata = {
  title: "Find a trainer",
  description: "Search personal trainers by specialty, city, price, language and rating. In person or online.",
};

export default function TrainersPage({ searchParams }: PageProps<"/trainers">) {
  return (
    <>
      <PageHeader
        title="Find a trainer"
        description="Filter by what matters to you, or let us suggest a few."
        action={
          <Link href="/match" className="text-sm font-medium text-brand hover:underline">
            Take the 1-minute quiz →
          </Link>
        }
      />
      <Suspense fallback={<SearchSkeleton />}>
        <TrainerSearchResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TrainerSearchResults({ searchParams }: Pick<PageProps<"/trainers">, "searchParams">) {
  const search = parseTrainerSearch(await searchParams);
  const [{ languages }, results] = await Promise.all([getFilterOptions(), searchTrainers(search)]);
  const chips = activeFilters(search);

  return (
    <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside aria-label="Filters">
        <FiltersPanel activeCount={chips.length}>
          {/* Keyed so the inputs reset when a chip or link changes the search. */}
          <FilterForm key={searchParamsOf(search).toString()} search={search} languages={languages} />
        </FiltersPanel>
      </aside>

      <section aria-labelledby="results-count" className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-count" className="font-semibold" aria-live="polite">
            {describeCount(results.total)}
          </h2>
          <SortForm key={searchParamsOf(search).toString()} search={search} />
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <ul className="flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <Link
                    href={chip.href}
                    aria-label={`Remove filter: ${chip.label}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm hover:border-brand"
                  >
                    {chip.label}
                    <span aria-hidden className="text-subtle">
                      ×
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={trainersHref(search, clearedFilters)} className="text-sm font-medium text-brand hover:underline">
              Clear all
            </Link>
          </div>
        )}

        {results.trainers.length === 0 ? (
          <Card className="space-y-2 text-center">
            <p className="font-medium">No trainers match all of those filters.</p>
            <p className="text-sm text-subtle">
              Try removing a filter or two, or{" "}
              <Link href="/match" className="font-medium text-brand">
                take the quiz
              </Link>{" "}
              and we&apos;ll suggest the closest matches.
            </p>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {results.trainers.map((trainer) => (
              <li key={trainer.id}>
                <TrainerCard trainer={trainer} headingLevel={3} />
              </li>
            ))}
          </ul>
        )}

        {results.pageCount > 1 && <Pagination search={search} page={results.page} pageCount={results.pageCount} />}
      </section>
    </div>
  );
}

/** Every filter off, keeping the sort order. */
const clearedFilters: Partial<TrainerSearch> = {
  q: undefined,
  city: undefined,
  format: undefined,
  maxPriceCents: undefined,
  gender: undefined,
  language: undefined,
  verifiedOnly: false,
  minRating: undefined,
};

function FilterForm({ search, languages }: { search: TrainerSearch; languages: string[] }) {
  return (
    <GetForm action="/trainers" className="space-y-4 rounded-xl border border-line bg-surface p-4">
      {search.sort !== "recommended" && <input type="hidden" name="sort" value={search.sort} />}
      <Field label="Search" name="filter-q" hint="Name, specialty or goal">
        <Input id="filter-q" name="q" type="search" defaultValue={search.q} placeholder="e.g. running" maxLength={80} />
      </Field>
      <Field label="City" name="filter-city">
        <Input id="filter-city" name="city" defaultValue={search.city} placeholder="e.g. London" maxLength={80} />
      </Field>
      <Field label="Session type" name="filter-format">
        <Select id="filter-format" name="format" defaultValue={search.format ?? ""}>
          <option value="">In person or online</option>
          {FORMAT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Max price per session" name="filter-max-price" hint="In the trainer's own currency">
        <Input
          id="filter-max-price"
          name="maxPrice"
          inputMode="decimal"
          pattern="\d+(\.\d{1,2})?"
          defaultValue={search.maxPriceCents === undefined ? "" : formatAmount(search.maxPriceCents)}
          placeholder="Any price"
        />
      </Field>
      <Field label="Trainer gender" name="filter-gender">
        <Select id="filter-gender" name="gender" defaultValue={search.gender ?? ""}>
          <option value="">Any</option>
          {GENDER_OPTIONS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Language" name="filter-language">
        <Select id="filter-language" name="language" defaultValue={search.language ?? ""}>
          <option value="">Any language</option>
          {languages.map((language) => (
            <option key={language} value={language}>
              {tagLabel(language)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Minimum rating" name="filter-min-rating">
        <Select id="filter-min-rating" name="minRating" defaultValue={search.minRating?.toString() ?? ""}>
          <option value="">Any rating</option>
          {MIN_RATING_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}+ stars
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="verified" value="1" defaultChecked={search.verifiedOnly} className="accent-brand" />
        Verified trainers only
      </label>
      <Button type="submit" className="w-full">
        Show trainers
      </Button>
    </GetForm>
  );
}

function SortForm({ search }: { search: TrainerSearch }) {
  const keep = [...searchParamsOf({ ...search, sort: "recommended", page: 1 })];
  return (
    <GetForm action="/trainers" className="flex items-center gap-2">
      {keep.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor="sort" className="whitespace-nowrap text-sm text-subtle">
        Sort by
      </label>
      <AutoSubmitSelect id="sort" name="sort" defaultValue={search.sort} className="w-auto">
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </AutoSubmitSelect>
      <noscript>
        <Button type="submit" variant="secondary">
          Sort
        </Button>
      </noscript>
    </GetForm>
  );
}

function Pagination({ search, page, pageCount }: { search: TrainerSearch; page: number; pageCount: number }) {
  const linkStyle = "rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-muted";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-2 pt-2">
      {page > 1 ? (
        <Link href={trainersHref(search, { page: page - 1 })} className={linkStyle} rel="prev">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-subtle">
        Page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <Link href={trainersHref(search, { page: page + 1 })} className={linkStyle} rel="next">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function SearchSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      <Skeleton className="h-11 lg:h-[34rem]" />
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <TrainerCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
