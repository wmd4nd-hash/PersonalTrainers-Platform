import Link from "next/link";
import type { BookingStatus, Prisma } from "@/generated/prisma/client";
import { Badge, Card } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatSlot } from "@/lib/scheduling";
import { CancelBookingForm } from "./cancel-form";

export const adminBookingSelect = {
  id: true,
  startsAt: true,
  status: true,
  format: true,
  priceCents: true,
  platformFeeCents: true,
  refundedCents: true,
  currency: true,
  packagePurchaseId: true,
  cancellationReason: true,
  createdAt: true,
  client: { select: { id: true, name: true, email: true } },
  trainer: { select: { timezone: true, user: { select: { id: true, name: true } } } },
} satisfies Prisma.BookingSelect;

export type AdminBooking = Prisma.BookingGetPayload<{ select: typeof adminBookingSelect }>;

export const bookingStatusStyles: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  CONFIRMED: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  CANCELLED: "bg-muted text-subtle",
  COMPLETED: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
};

export const bookingStatusLabels: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

/** What an admin cancellation will do, in words. */
function cancelOutcome(b: AdminBooking) {
  if (b.status === "PENDING_PAYMENT") return "No payment has been taken, so there is nothing to refund.";
  if (b.packagePurchaseId) return "The client gets the package session back.";
  const refundable = b.priceCents - b.refundedCents;
  return `The client is refunded ${formatMoney(refundable, b.currency)} in full.`;
}

export function AdminBookingList({ bookings, now, empty }: { bookings: AdminBooking[]; now: Date; empty: string }) {
  if (bookings.length === 0) return <Card className="text-center text-sm text-subtle">{empty}</Card>;
  return (
    <ul className="space-y-3">
      {bookings.map((b) => {
        const cancellable = (b.status === "CONFIRMED" || b.status === "PENDING_PAYMENT") && b.startsAt > now;
        return (
          <li key={b.id} aria-label={`Booking ${b.client.name} with ${b.trainer.user.name}`}>
            <Card className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{formatSlot(b.startsAt, b.trainer.timezone)}</span>
                  <Badge className={bookingStatusStyles[b.status]}>{bookingStatusLabels[b.status]}</Badge>
                  {b.packagePurchaseId && <Badge>Package</Badge>}
                  {b.format === "ONLINE" && <Badge>Online</Badge>}
                </div>
                <p className="text-sm">
                  <Link href={`/admin/users/${b.client.id}`} className="hover:underline">
                    {b.client.name}
                  </Link>
                  <span className="text-subtle"> with </span>
                  <Link href={`/admin/users/${b.trainer.user.id}`} className="hover:underline">
                    {b.trainer.user.name}
                  </Link>
                </p>
                <p className="text-xs text-subtle">
                  {formatMoney(b.priceCents, b.currency)}
                  {b.platformFeeCents > 0 && ` · fee ${formatMoney(b.platformFeeCents, b.currency)}`}
                  {b.refundedCents > 0 && (
                    <span className="font-medium text-foreground"> · Refunded {formatMoney(b.refundedCents, b.currency)}</span>
                  )}
                  {" · "}
                  {b.client.email}
                </p>
                {b.cancellationReason && <p className="text-sm">“{b.cancellationReason}”</p>}
              </div>
              {cancellable && <CancelBookingForm bookingId={b.id} outcome={cancelOutcome(b)} />}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
