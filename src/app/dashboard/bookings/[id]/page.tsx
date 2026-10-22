import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { completeBooking } from "@/app/actions/bookings";
import { BookingReviewAction } from "@/app/dashboard/_components/booking-review-action";
import { AutoRefresh } from "@/components/scheduling/auto-refresh";
import { BookingStatusBadge, formatLabels } from "@/components/scheduling/booking-status";
import { CancelBookingForm, CancelPreviewText } from "@/components/scheduling/cancel-booking-form";
import { JoinCallLink } from "@/components/scheduling/join-call-link";
import { LinkButton, linkButtonClass } from "@/components/scheduling/link-button";
import { LocalTime } from "@/components/scheduling/local-time";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { describePolicy } from "@/lib/cancellation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import {
  dateKey,
  formatSlot,
  formatSlotRange,
  freeCancellationDeadline,
  reschedulePolicy,
} from "@/lib/scheduling";
import { JOIN_EARLY_MINUTES, joinUrl, sessionPhase } from "@/lib/sessions";
import { cancelPreview } from "./cancel-preview";

export const metadata: Metadata = { title: "Session" };

export default function BookingPage({ params, searchParams }: PageProps<"/dashboard/bookings/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <BookingDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function loadBooking(id: string, userId: string) {
  // Only the booking's client or trainer can see it.
  return db.booking.findFirst({
    where: { id, OR: [{ clientId: userId }, { trainer: { userId } }] },
    include: {
      client: { select: { name: true } },
      trainer: {
        select: {
          id: true,
          userId: true,
          timezone: true,
          cancellationWindowHours: true,
          lateCancelFeePercent: true,
          user: { select: { name: true } },
        },
      },
      packagePurchase: { select: { package: { select: { title: true } } } },
    },
  });
}

type Booking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

async function BookingDetail({ params, searchParams }: PageProps<"/dashboard/bookings/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const booking = await loadBooking(id, user.id);
  if (!booking) notFound();

  const now = new Date();
  const { trainer } = booking;
  const isTrainer = trainer.userId === user.id;
  const otherName = isTrainer ? booking.client.name : trainer.user.name;
  const minutes = Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000);
  const upcoming = booking.startsAt > now;
  const cancellable = upcoming && (booking.status === "PENDING_PAYMENT" || booking.status === "CONFIRMED");
  const reschedule =
    booking.status === "CONFIRMED" && upcoming
      ? reschedulePolicy({
          actor: isTrainer ? "TRAINER" : "CLIENT",
          startsAt: booking.startsAt,
          now,
          windowHours: trainer.cancellationWindowHours,
        })
      : null;
  const canComplete = isTrainer && booking.status === "CONFIRMED" && booking.startsAt < now;

  return (
    <>
      <Link href="/dashboard" className="text-sm text-subtle hover:underline">
        ← Overview
      </Link>
      <div className="mt-2">
        <PageHeader
          title={`Session with ${otherName}`}
          description={`${formatLabels[booking.format]} · ${minutes} minutes`}
          action={<BookingStatusBadge status={booking.status} />}
        />
      </div>

      <div className="mb-6 space-y-3 empty:hidden">
        {query.booked && !isTrainer && <BookedBanner booking={booking} />}
        {query.rescheduled && booking.status === "CONFIRMED" && (
          <Alert tone="success">
            Session moved to {formatSlot(booking.startsAt, trainer.timezone)}. We&apos;ve let{" "}
            {firstName(otherName)} know.
          </Alert>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <dl className="space-y-4 text-sm">
              <Row label="When">
                <span className="font-medium">
                  {formatSlotRange(booking.startsAt, booking.endsAt, trainer.timezone)}
                </span>
                <LocalTime
                  start={booking.startsAt}
                  end={booking.endsAt}
                  timezone={trainer.timezone}
                  className="block text-subtle"
                />
              </Row>
              <Row label={isTrainer ? "Client" : "Trainer"}>
                {isTrainer ? (
                  booking.client.name
                ) : (
                  <Link href={`/trainers/${trainer.id}`} className="text-brand hover:underline">
                    {trainer.user.name}
                  </Link>
                )}
              </Row>
              <Row label="Where">
                <Where booking={booking} now={now} />
              </Row>
              {booking.notes && (
                <Row label={isTrainer ? "Notes from the client" : "Your notes"}>
                  <span className="whitespace-pre-line">{booking.notes}</span>
                </Row>
              )}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Payment</h2>
            <dl className="space-y-3 text-sm">
              <Row label={booking.packagePurchaseId ? "Session value" : "Price"}>
                {formatMoney(booking.priceCents, booking.currency)}
              </Row>
              <Row label="Paid with">
                {booking.packagePurchaseId
                  ? `A session from ${booking.packagePurchase?.package.title ?? "a package"}`
                  : booking.status === "PENDING_PAYMENT"
                    ? "Card (waiting for payment)"
                    : "Card"}
              </Row>
              {booking.refundedCents > 0 && (
                <Row label="Refunded">{formatMoney(booking.refundedCents, booking.currency)}</Row>
              )}
            </dl>
          </Card>

          {booking.status === "CANCELLED" && <CancelledDetails booking={booking} viewerId={user.id} />}
        </div>

        <aside className="space-y-4">
          <Card className="space-y-3">
            <h2 className="font-semibold">Manage</h2>
            <div className="flex flex-col gap-2">
              {booking.status === "CONFIRMED" && upcoming && (
                <a href={`/api/bookings/${booking.id}/ics`} download className={linkButtonClass()}>
                  Add to calendar
                </a>
              )}
              {reschedule?.allowed && (
                <LinkButton href={`/dashboard/bookings/${booking.id}/reschedule`}>Reschedule</LinkButton>
              )}
              {canComplete && (
                <form action={completeBooking.bind(null, booking.id)}>
                  <SubmitButton className="w-full" pendingText="Saving…">
                    Mark completed
                  </SubmitButton>
                </form>
              )}
              {isTrainer && (
                <LinkButton href={`/dashboard/calendar?week=${dateKey(booking.startsAt, trainer.timezone)}`}>
                  Show in calendar
                </LinkButton>
              )}
              <BookingReviewAction booking={booking} viewer={user} />
            </div>
            {reschedule && !reschedule.allowed && <p className="text-xs text-subtle">{reschedule.reason}</p>}
            {booking.status === "PENDING_PAYMENT" && !isTrainer && (
              <p className="text-xs text-subtle">
                Waiting for your payment. If you closed the payment page, cancel this booking and book the time
                again.
              </p>
            )}
          </Card>

          {cancellable && (
            <Card id="cancel" className="space-y-3">
              <h2 className="font-semibold">Cancellation</h2>
              <p className="text-sm">
                {describePolicy(trainer.cancellationWindowHours, trainer.lateCancelFeePercent)}
              </p>
              <FreeUntil booking={booking} isTrainer={isTrainer} now={now} />
              <CancelPreviewText
                preview={cancelPreview({
                  viewer: isTrainer ? "TRAINER" : "CLIENT",
                  status: booking.status as "PENDING_PAYMENT" | "CONFIRMED",
                  startsAt: booking.startsAt,
                  now,
                  windowHours: trainer.cancellationWindowHours,
                  lateFeePercent: trainer.lateCancelFeePercent,
                  priceCents: booking.priceCents,
                  refundedCents: booking.refundedCents,
                  currency: booking.currency,
                  paidWithPackage: Boolean(booking.packagePurchaseId),
                  movedByTrainer: Boolean(booking.movedByTrainerAt),
                  clientName: firstName(booking.client.name),
                })}
              />
              <details className="group rounded-lg border border-line">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300">
                  Cancel this session…
                </summary>
                <div className="border-t border-line p-3">
                  <CancelBookingForm bookingId={booking.id} otherName={firstName(otherName)} />
                </div>
              </details>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
      <dt className="text-subtle">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function BookedBanner({ booking }: { booking: Booking }) {
  if (booking.status === "PENDING_PAYMENT") {
    return (
      <>
        <Alert tone="success">
          Thanks! We&apos;re confirming your payment. This page updates by itself in a moment.
        </Alert>
        <AutoRefresh />
      </>
    );
  }
  if (booking.status !== "CONFIRMED") return null;
  return (
    <Alert tone="success">
      {booking.packagePurchaseId
        ? "You're booked! We used one session from your package."
        : `You're booked and your payment of ${formatMoney(booking.priceCents, booking.currency)} went through.`}{" "}
      We&apos;ve sent the details to your email.
    </Alert>
  );
}

function Where({ booking, now }: { booking: Booking; now: Date }) {
  if (booking.format === "IN_PERSON") {
    return <span>{booking.location || "Your trainer will confirm the place with you."}</span>;
  }
  const url = joinUrl(booking, now);
  if (url) {
    const phase = sessionPhase(booking, now);
    return (
      <div className="space-y-2">
        <JoinCallLink href={url} />
        <p className="text-xs text-subtle">
          {phase === "in-progress"
            ? "Your session is happening now."
            : phase === "starting-soon"
              ? "Starting soon. You can join now."
              : `Online video call. It's a good idea to join up to ${JOIN_EARLY_MINUTES} minutes early to check your camera and sound.`}
        </p>
        <p className="break-all text-xs text-subtle">{url}</p>
      </div>
    );
  }
  if (booking.status === "PENDING_PAYMENT") {
    return <span>Online. The video link appears here once payment is confirmed.</span>;
  }
  return <span>Online video call{booking.status === "CANCELLED" ? " (cancelled)" : " (ended)"}</span>;
}

function FreeUntil({ booking, isTrainer, now }: { booking: Booking; isTrainer: boolean; now: Date }) {
  const { cancellationWindowHours, lateCancelFeePercent, timezone } = booking.trainer;
  if (isTrainer || booking.status !== "CONFIRMED" || cancellationWindowHours === 0) return null;
  if (booking.movedByTrainerAt) {
    return (
      <p className="text-sm text-subtle">
        {booking.trainer.user.name} moved this session, so you can cancel it free of charge.
      </p>
    );
  }
  const deadline = freeCancellationDeadline(booking.startsAt, cancellationWindowHours);
  if (deadline <= now) return null;
  const until = formatSlot(deadline, timezone);
  return (
    <p className="text-sm text-subtle">
      {lateCancelFeePercent > 0
        ? `Free cancellation and rescheduling until ${until}.`
        : `You can reschedule until ${until}.`}
    </p>
  );
}

function CancelledDetails({ booking, viewerId }: { booking: Booking; viewerId: string }) {
  const by =
    booking.cancelledById === viewerId
      ? "you"
      : booking.cancelledById === booking.clientId
        ? booking.client.name
        : booking.cancelledById === booking.trainer.userId
          ? booking.trainer.user.name
          : "our support team";
  return (
    <Card className="space-y-2 text-sm">
      <h2 className="font-semibold">Cancelled</h2>
      <p>
        Cancelled by {by}
        {booking.cancelledAt && <> on {formatSlot(booking.cancelledAt, booking.trainer.timezone)}</>}.
      </p>
      {booking.cancellationReason && <p className="text-subtle">“{booking.cancellationReason}”</p>}
      {booking.refundedCents > 0 ? (
        <p>A refund of {formatMoney(booking.refundedCents, booking.currency)} was issued to the card used.</p>
      ) : booking.packagePurchaseId ? null : (
        <p className="text-subtle">No refund was due.</p>
      )}
    </Card>
  );
}
