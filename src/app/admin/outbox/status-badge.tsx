import { Badge } from "@/components/ui";
import type { EmailStatus } from "@/generated/prisma/client";

const styles: Record<EmailStatus, { label: string; className: string }> = {
  QUEUED: { label: "Queued", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  SENT: { label: "Sent", className: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
};

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return <Badge className={styles[status].className}>{styles[status].label}</Badge>;
}

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Admin times are shown in UTC so everyone on the team reads the same value. */
export function formatUtc(date: Date): string {
  return `${dateTime.format(date)} UTC`;
}
