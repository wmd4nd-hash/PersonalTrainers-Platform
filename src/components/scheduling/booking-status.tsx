import type { BookingStatus } from "@/generated/prisma/client";
import { Badge } from "../ui";

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

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge className={bookingStatusStyles[status]}>{bookingStatusLabels[status]}</Badge>;
}

export const formatLabels = { IN_PERSON: "In person", ONLINE: "Online" } as const;
