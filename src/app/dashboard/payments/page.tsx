import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/earnings";
import { formatMoney } from "@/lib/money";
import { loadClientPayments, type ClientPayment } from "@/lib/payment-records";
import { PaymentStatusBadge } from "./payment-status";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <>
      <PageHeader title="Payments" description="Your card payments, refunds and receipts." />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Payments />
      </Suspense>
    </>
  );
}

const itemStatusNotes: Partial<Record<ClientPayment["itemStatus"], string>> = {
  CANCELLED: "Cancelled",
  COMPLETED: "Session done",
  EXHAUSTED: "All sessions used",
  EXPIRED: "Package expired",
};

async function Payments() {
  const client = await requireRole("CLIENT");
  const payments = await loadClientPayments(client.id);

  if (payments.length === 0) {
    return (
      <Card className="text-sm">
        You haven&apos;t paid for anything yet. Payments for sessions and packages will show up here, with a
        receipt for each.{" "}
        <Link href="/trainers" className="font-medium text-brand">
          Find a trainer
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {payments.map((p) => {
          const receipt = `/dashboard/payments/${p.kind}/${p.id}`;
          const note = itemStatusNotes[p.itemStatus];
          return (
            <li key={`${p.kind}:${p.id}`}>
              <Card className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 space-y-1">
                  <Link href={receipt} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-sm text-subtle">{p.detail}</p>
                  <p className="text-xs text-subtle">
                    Paid {formatDate(p.paidAt, p.timezone)}
                    {note && <> · {note}</>}
                    {p.simulated && <> · Simulated payment</>}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <p className="font-semibold tabular-nums">{formatMoney(p.amountCents, p.currency)}</p>
                  <PaymentStatusBadge status={p.status} />
                  {p.refundedCents > 0 && (
                    <p className="text-xs text-subtle">Refunded {formatMoney(p.refundedCents, p.currency)}</p>
                  )}
                  <Link href={receipt} className="text-sm font-medium text-brand" aria-label={`Receipt for ${p.title}`}>
                    Receipt
                  </Link>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-subtle">
        Refunds go back to the card you paid with and usually arrive within 5–10 business days.
      </p>
    </div>
  );
}
