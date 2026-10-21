import { Badge } from "@/components/ui";
import type { PurchaseState } from "@/lib/package-pricing";

const labels: Record<PurchaseState, string> = {
  usable: "Active",
  "awaiting-payment": "Awaiting payment",
  abandoned: "Payment not completed",
  "used-up": "Used up",
  expired: "Expired",
  cancelled: "Cancelled",
};

const styles: Record<PurchaseState, string> = {
  usable: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  "awaiting-payment": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  abandoned: "bg-muted text-subtle",
  "used-up": "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  expired: "bg-muted text-subtle",
  cancelled: "bg-muted text-subtle",
};

export function PurchaseBadge({ state }: { state: PurchaseState }) {
  return <Badge className={styles[state]}>{labels[state]}</Badge>;
}

/** "Jan 19, 2027" in the given timezone. */
export function formatDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(
    date,
  );
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
