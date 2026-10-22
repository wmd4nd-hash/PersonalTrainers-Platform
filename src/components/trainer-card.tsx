import Link from "next/link";
import type { ReactNode } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { formatMoney } from "@/lib/money";
import { tagLabel } from "@/lib/search";
import { Avatar } from "./avatar";
import { RatingSummary } from "./rating-summary";
import { Badge } from "./ui";
import { VerifiedBadge } from "./verified-badge";

/** Everything a TrainerCard shows. Use it as the `select` when loading trainers for cards. */
export const trainerCardSelect = {
  id: true,
  headline: true,
  city: true,
  specialties: true,
  languages: true,
  offersInPerson: true,
  offersOnline: true,
  sessionRateCents: true,
  sessionMinutes: true,
  currency: true,
  yearsExperience: true,
  verificationStatus: true,
  ratingAverage: true,
  ratingCount: true,
  user: { select: { name: true, avatarFileId: true } },
} satisfies Prisma.TrainerProfileSelect;

export type TrainerCardData = Prisma.TrainerProfileGetPayload<{ select: typeof trainerCardSelect }>;

/**
 * A trainer in a list. The whole card links to their profile (the name's link
 * is stretched over it); `children` sit above the link, so buttons inside work.
 */
export function TrainerCard({
  trainer,
  headingLevel = 2,
  children,
}: {
  trainer: TrainerCardData;
  headingLevel?: 2 | 3;
  children?: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const formats = [trainer.offersInPerson && "In person", trainer.offersOnline && "Online"].filter(Boolean).join(" · ");

  return (
    <article className="relative flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-colors focus-within:border-brand hover:border-brand sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={trainer.user.name} fileId={trainer.user.avatarFileId} size={56} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Heading className="font-semibold leading-snug">
              <Link
                href={`/trainers/${trainer.id}`}
                className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand"
              >
                {trainer.user.name}
              </Link>
            </Heading>
            <VerifiedBadge status={trainer.verificationStatus} />
          </div>
          <RatingSummary average={trainer.ratingAverage} count={trainer.ratingCount} />
          <p className="text-sm text-subtle">
            {trainer.city || "Online"}
            {trainer.city && formats && <> · {formats}</>}
          </p>
        </div>
      </div>

      {trainer.headline && <p className="mt-3 line-clamp-2 text-sm">{trainer.headline}</p>}

      {trainer.specialties.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1" aria-label="Specialties">
          {trainer.specialties.slice(0, 3).map((s) => (
            <li key={s}>
              <Badge>{tagLabel(s)}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pt-4 text-sm">
        {trainer.languages.length > 0 && (
          <p className="text-subtle">Speaks {trainer.languages.map(tagLabel).join(", ")}</p>
        )}
        <p>
          <span className="text-base font-semibold">{formatMoney(trainer.sessionRateCents, trainer.currency)}</span>
          <span className="text-subtle"> / {trainer.sessionMinutes} min</span>
        </p>
      </div>

      {children && <div className="relative z-10 mt-4 border-t border-line pt-4">{children}</div>}
    </article>
  );
}

export function TrainerCardSkeleton() {
  return <div className="h-56 animate-pulse rounded-xl bg-muted" />;
}
