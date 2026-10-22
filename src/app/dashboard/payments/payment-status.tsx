import { Badge } from "@/components/ui";
import { paymentStatusLabels, type PaymentStatus } from "@/lib/earnings";

const styles: Record<PaymentStatus, string> = {
  paid: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  partly_refunded: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  refunded: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={styles[status]}>{paymentStatusLabels[status]}</Badge>;
}
