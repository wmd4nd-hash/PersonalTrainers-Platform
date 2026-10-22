import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { RatingSummary } from "@/components/rating-summary";
import { Alert, Badge, Card, Skeleton } from "@/components/ui";
import { VerifiedBadge } from "@/components/verified-badge";
import { getCurrentUser } from "@/lib/auth";
import { getBusyPeriods } from "@/lib/bookings";
import { describePolicy } from "@/lib/cancellation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getUsableCredits } from "@/lib/packages";
import { generateSlots, upcomingDateKeys } from "@/lib/scheduling";
import { BookingForm, type SlotOption } from "./booking-form";
import { FavoriteButton } from "./favorite-button";
import { MessageButton } from "./message-button";
import { PackagesSection } from "./packages-section";
import { ReviewsSection } from "./reviews-section";

export default function TrainerPage({ params, searchParams }: PageProps<"/trainers/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TrainerProfile params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export type PublicTrainer = NonNullable<Awaited<ReturnType<typeof loadTrainer>>>;

function loadTrainer(id: string) {
  return db.trainerProfile.findFirst({
    where: { id, published: true, user: { suspendedAt: null } },
    include: {
      user: { select: { name: true, gender: true, avatarFileId: true } },
      availability: true,
    },
  });
}

async function TrainerProfile({ params, searchParams }: PageProps<"/trainers/[id]">) {
  const { id } = await params;
  const { cancelled } = await searchParams;

  const trainer = await loadTrainer(id);
  if (!trainer) notFound();

  const now = new Date();
  const [viewer, busy] = await Promise.all([getCurrentUser(), getBusyPeriods(trainer.id, now)]);
  const credits = viewer?.role === "CLIENT" ? await getUsableCredits(viewer.id, trainer.id, now) : [];

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: trainer.timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: trainer.timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const slots: SlotOption[] = generateSlots({
    windows: trainer.availability,
    busy,
    timezone: trainer.timezone,
    sessionMinutes: trainer.sessionMinutes,
    now,
    minNoticeMinutes: trainer.minNoticeHours * 60,
  }).map((slot) => ({
    value: slot.toISOString(),
    day: dayLabel.format(slot),
    time: timeLabel.format(slot),
  }));
  const formats = [
    ...(trainer.offersInPerson ? (["IN_PERSON"] as const) : []),
    ...(trainer.offersOnline ? (["ONLINE"] as const) : []),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="min-w-0 space-y-6">
        <div className="flex items-start gap-4">
          <Avatar name={trainer.user.name} fileId={trainer.user.avatarFileId} size={80} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{trainer.user.name}</h1>
              <VerifiedBadge status={trainer.verificationStatus} />
            </div>
            {trainer.headline && <p className="text-lg text-subtle">{trainer.headline}</p>}
            <RatingSummary average={trainer.ratingAverage} count={trainer.ratingCount} />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-subtle">
          <span>{trainer.city || "Online only"}</span>
          <span>{trainer.yearsExperience} years experience</span>
          <span>
            {formatMoney(trainer.sessionRateCents, trainer.currency)} per {trainer.sessionMinutes}-minute
            session
          </span>
          <span>
            {[trainer.offersInPerson && "In person", trainer.offersOnline && "Online"].filter(Boolean).join(" · ")}
          </span>
          {trainer.languages.length > 0 && (
            <span className="capitalize">Speaks {trainer.languages.join(", ")}</span>
          )}
        </div>
        {trainer.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {trainer.specialties.map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </div>
        )}
        {trainer.bio && (
          <Card>
            <h2 className="mb-2 font-semibold">About</h2>
            <p className="whitespace-pre-line text-sm leading-6">{trainer.bio}</p>
          </Card>
        )}
        <PackagesSection trainer={trainer} viewer={viewer} />
        <ReviewsSection trainerId={trainer.id} />
      </section>

      <aside className="space-y-4">
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold">Book a session</h2>
            <p className="text-xs text-subtle">Times shown in {trainer.timezone}</p>
          </div>
          {cancelled && <Alert>Checkout was cancelled. Nothing has been charged.</Alert>}
          {!viewer ? (
            <p className="text-sm">
              <Link href="/login" className="font-medium text-brand">
                Log in
              </Link>{" "}
              or{" "}
              <Link href="/signup" className="font-medium text-brand">
                sign up
              </Link>{" "}
              to book.
            </p>
          ) : viewer.role !== "CLIENT" ? (
            <p className="text-sm text-subtle">Only client accounts can book sessions.</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-subtle">No open times in the next four weeks.</p>
          ) : (
            <BookingForm
              trainerId={trainer.id}
              slots={slots}
              formats={formats}
              credits={credits.map((c) => ({ id: c.purchaseId, label: `${c.title} (${c.remaining} left)` }))}
              priceLabel={formatMoney(trainer.sessionRateCents, trainer.currency)}
              timezone={trainer.timezone}
              dates={upcomingDateKeys(now, trainer.timezone)}
            />
          )}
          <p className="text-xs text-subtle">
            {describePolicy(trainer.cancellationWindowHours, trainer.lateCancelFeePercent)}
          </p>
        </Card>
        <div className="flex flex-wrap gap-2">
          <MessageButton trainerId={trainer.id} viewer={viewer} />
          <FavoriteButton trainerId={trainer.id} viewer={viewer} />
        </div>
      </aside>
    </div>
  );
}
