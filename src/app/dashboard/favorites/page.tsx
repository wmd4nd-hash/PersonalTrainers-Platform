import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { removeSavedTrainer } from "@/app/actions/favorites";
import { SubmitButton } from "@/components/submit-button";
import { TrainerCard, TrainerCardSkeleton, trainerCardSelect } from "@/components/trainer-card";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleTrainerWhere } from "@/lib/search";

export const metadata: Metadata = { title: "Saved trainers" };

export default function FavoritesPage() {
  return (
    <>
      <PageHeader title="Saved trainers" description="Trainers you've saved to compare and book later." />
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <TrainerCardSkeleton />
            <TrainerCardSkeleton />
          </div>
        }
      >
        <SavedTrainers />
      </Suspense>
    </>
  );
}

async function SavedTrainers() {
  const client = await requireRole("CLIENT");
  const favorites = await db.favorite.findMany({
    // Trainers who unpublish or are suspended drop out of the list.
    where: { clientId: client.id, trainer: visibleTrainerWhere },
    orderBy: { createdAt: "desc" },
    select: { trainer: { select: trainerCardSelect } },
  });

  if (favorites.length === 0) {
    return (
      <Card className="space-y-2 text-center">
        <p className="font-medium">You haven&apos;t saved any trainers yet.</p>
        <p className="text-sm text-subtle">
          Tap <span className="font-medium">Save</span> on a trainer&apos;s profile to keep them here.{" "}
          <Link href="/trainers" className="font-medium text-brand">
            Browse trainers
          </Link>{" "}
          or{" "}
          <Link href="/match" className="font-medium text-brand">
            take the quiz
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {favorites.map(({ trainer }) => (
        <li key={trainer.id}>
          <TrainerCard trainer={trainer}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/trainers/${trainer.id}`} className="text-sm font-medium text-brand hover:underline">
                View and book
              </Link>
              <form action={removeSavedTrainer.bind(null, trainer.id)}>
                <SubmitButton variant="ghost" pendingText="Removing…" className="px-3 py-1.5 text-subtle">
                  Remove<span className="sr-only"> {trainer.user.name}</span>
                </SubmitButton>
              </form>
            </div>
          </TrainerCard>
        </li>
      ))}
    </ul>
  );
}
