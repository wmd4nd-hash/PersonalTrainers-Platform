import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Skeleton } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/earnings";
import { formatMoney } from "@/lib/money";
import { loadClientPayment } from "@/lib/payment-records";
import { site } from "@/lib/site";
import { PaymentStatusBadge } from "../../payment-status";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Receipt" };

// Print only the receipt, not the site header and dashboard menu around it.
const printStyles = `
@media print {
  body * { visibility: hidden; }
  #receipt, #receipt * { visibility: visible; }
  #receipt { position: absolute; top: 0; left: 0; width: 100%; border: 0; }
}`;

export default function ReceiptPage({ params }: PageProps<"/dashboard/payments/[kind]/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 max-w-2xl" />}>
      <Receipt params={params} />
    </Suspense>
  );
}

async function Receipt({ params }: Pick<PageProps<"/dashboard/payments/[kind]/[id]">, "params">) {
  const client = await requireRole("CLIENT");
  const { kind, id } = await params;
  const payment = await loadClientPayment(client.id, kind, id);
  if (!payment) notFound();

  const money = (cents: number) => formatMoney(cents, payment.currency);
  const kept = payment.amountCents - payment.refundedCents;

  return (
    <div className="max-w-2xl space-y-4">
      <style>{printStyles}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/payments" className="text-sm font-medium text-brand">
          ← All payments
        </Link>
        <PrintButton />
      </div>

      <article id="receipt" className="space-y-6 rounded-xl border border-line bg-surface p-5 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-subtle">{site.name}</p>
            <h1 className="text-2xl font-semibold tracking-tight">Receipt</h1>
          </div>
          <PaymentStatusBadge status={payment.status} />
        </header>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Detail label="Receipt number" value={<span className="break-all font-mono text-xs">{payment.id}</span>} />
          <Detail label="Date paid" value={formatDate(payment.paidAt, payment.timezone)} />
          <Detail
            label="Billed to"
            value={
              <>
                {client.name}
                <br />
                <span className="break-all text-subtle">{client.email}</span>
              </>
            }
          />
          <Detail label="Trainer" value={payment.trainerName} />
          <Detail
            label="Payment method"
            value={payment.simulated ? "Card (simulated, no money was taken)" : "Card"}
          />
        </dl>

        <table className="w-full text-sm">
          <caption className="sr-only">Charges and refunds</caption>
          <thead className="border-b border-line text-left text-xs text-subtle">
            <tr>
              <th scope="col" className="py-2 font-medium">Description</th>
              <th scope="col" className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="py-3 pr-4">
                <p className="font-medium">{payment.title}</p>
                <p className="text-subtle">{payment.detail}</p>
              </td>
              <td className="py-3 text-right align-top tabular-nums">{money(payment.amountCents)}</td>
            </tr>
            {payment.refundedCents > 0 && (
              <tr>
                <td className="py-3 pr-4">Refunded to your card</td>
                <td className="py-3 text-right tabular-nums">{money(-payment.refundedCents)}</td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-line font-semibold">
            <tr>
              <th scope="row" className="py-3 text-left">
                {payment.refundedCents > 0 ? "Total after refunds" : "Total paid"}
              </th>
              <td className="py-3 text-right tabular-nums">{money(kept)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="text-xs text-subtle">
          Prices include any platform fees. Questions about this payment? Send {payment.trainerName} a message from
          your dashboard.
        </p>
      </article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
