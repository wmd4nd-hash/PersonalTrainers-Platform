import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TrainerCard, TrainerCardSkeleton } from "@/components/trainer-card";
import { Card } from "@/components/ui";
import { findMatches } from "@/lib/discovery";
import { describeAnswers, matchHref, type MatchAnswers } from "@/lib/matching";
import { DEFAULT_SEARCH, trainersHref } from "@/lib/search";
import { parseMatchAnswers } from "@/lib/validation/discovery";

export const metadata: Metadata = {
  title: "Your trainer matches",
  description: "Personal trainers matched to your goal, budget and schedule.",
};

export default function MatchResultsPage({ searchParams }: PageProps<"/match/results">) {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <MatchResults searchParams={searchParams} />
    </Suspense>
  );
}

/** The same answers as /trainers filters, for browsing beyond the top five. */
function browseHref(answers: MatchAnswers) {
  return trainersHref(DEFAULT_SEARCH, {
    q: answers.goal,
    format: answers.format === "either" ? undefined : answers.format,
    city: answers.format === "in-person" ? answers.city : undefined,
    maxPriceCents: answers.budgetCents,
    gender: answers.gender,
    language: answers.language,
  });
}

async function MatchResults({ searchParams }: Pick<PageProps<"/match/results">, "searchParams">) {
  const answers = parseMatchAnswers(await searchParams);
  const matches = await findMatches(answers, new Date());
  const summary = describeAnswers(answers);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {matches.length > 0 ? "Your top matches" : "No matches yet"}
        </h1>
        {summary.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Your answers">
            {summary.map((part) => (
              <li key={part} className="rounded-full bg-muted px-3 py-1 text-sm">
                {part}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={matchHref("/match", answers, { step: "1" })} className="font-medium text-brand hover:underline">
            Change my answers
          </Link>
          <Link href={browseHref(answers)} className="font-medium text-brand hover:underline">
            Browse all trainers like this
          </Link>
        </div>
      </div>

      {matches.length === 0 ? (
        <Card className="space-y-2 text-center">
          <p className="font-medium">No trainers fit all of that just yet.</p>
          <p className="text-sm text-subtle">
            Try training online, a different city or no gender preference.{" "}
            <Link href="/trainers" className="font-medium text-brand">
              See every trainer
            </Link>
          </p>
        </Card>
      ) : (
        <ol className="space-y-4">
          {matches.map((match, i) => (
            <li key={match.trainer.id} className="flex gap-3">
              <span
                aria-hidden
                className="mt-4 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <TrainerCard trainer={match.trainer.card}>
                  <ul className="space-y-1 text-sm" aria-label={`Why ${match.trainer.card.user.name} is a match`}>
                    {match.reasons.map((reason) => (
                      <li key={reason} className="flex gap-2">
                        <span aria-hidden className="text-brand">
                          ✓
                        </span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                  {match.caveats.length > 0 && (
                    <p className="mt-2 text-xs text-subtle">Worth knowing: {match.caveats.join(" · ")}</p>
                  )}
                </TrainerCard>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      {Array.from({ length: 3 }, (_, i) => (
        <TrainerCardSkeleton key={i} />
      ))}
    </div>
  );
}
