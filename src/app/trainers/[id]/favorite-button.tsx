import Link from "next/link";
import { removeSavedTrainer, saveTrainer } from "@/app/actions/favorites";
import { SubmitButton } from "@/components/submit-button";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** "Save" button on the trainer's page. Clients only; signed-out visitors are asked to log in. */
export async function FavoriteButton({ trainerId, viewer }: { trainerId: string; viewer: CurrentUser | null }) {
  if (!viewer) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        <span aria-hidden>♡</span> Log in to save
      </Link>
    );
  }
  if (viewer.role !== "CLIENT") return null;

  const saved = await db.favorite.findUnique({
    where: { clientId_trainerId: { clientId: viewer.id, trainerId } },
    select: { id: true },
  });

  return saved ? (
    <form action={removeSavedTrainer.bind(null, trainerId)}>
      <SubmitButton variant="secondary" pendingText="Removing…" className="gap-1.5" title="Remove from saved trainers">
        <span aria-hidden className="text-brand">
          ♥
        </span>
        Saved<span className="sr-only">, remove from saved trainers</span>
      </SubmitButton>
    </form>
  ) : (
    <form action={saveTrainer.bind(null, trainerId)}>
      <SubmitButton variant="secondary" pendingText="Saving…" className="gap-1.5">
        <span aria-hidden>♡</span>
        Save
      </SubmitButton>
    </form>
  );
}
