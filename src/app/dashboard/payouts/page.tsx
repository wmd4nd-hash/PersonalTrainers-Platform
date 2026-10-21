import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, Badge, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import { summarize } from "@/lib/earnings";
import { feePolicy } from "@/lib/fees";
import { formatMoney } from "@/lib/money";
import { loadTrainerLedger } from "@/lib/payment-records";
import { isSimulatedId, paymentsEnabled, payoutStatus, type PayoutStatus } from "@/lib/payments";
import { PayoutsDashboardForm, PayoutsSetupForm } from "./payout-actions";

export const metadata: Metadata = { title: "Payouts" };

const statusLabels: Record<PayoutStatus, string> = {
  not_started: "Not started",
  pending: "Pending",
  active: "Active",
};

const statusStyles: Record<PayoutStatus, string> = {
  not_started: "bg-muted text-subtle",
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  active: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
};

export default function PayoutsPage({ searchParams }: PageProps<"/dashboard/payouts">) {
  return (
    <>
      <PageHeader title="Payouts" description="Get paid for your sessions and packages." />
      <Suspense fallback={<Skeleton className="h-72" />}>
        <Payouts searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Payouts({ searchParams }: Pick<PageProps<"/dashboard/payouts">, "searchParams">) {
  const trainerId = await requireTrainerProfileId();
  const { onboarding } = await searchParams;
  const trainer = await db.trainerProfile.findUniqueOrThrow({
    where: { id: trainerId },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      currency: true,
      timezone: true,
    },
  });

  const stripeOn = paymentsEnabled();
  const status = payoutStatus(trainer, stripeOn);
  const simulatedAccount = Boolean(trainer.stripeAccountId && isSimulatedId(trainer.stripeAccountId));
  const policy = feePolicy();

  // While payouts aren't active the platform collects payments and holds the trainer's share.
  const held =
    status === "active"
      ? []
      : summarize(await loadTrainerLedger(trainerId, trainer.timezone, new Date()), undefined, trainer.currency).filter(
          (t) => t.netCents > 0,
        );

  return (
    <div className="max-w-2xl space-y-6">
      <OnboardingMessage outcome={typeof onboarding === "string" ? onboarding : undefined} status={status} />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Payout account</h2>
          <Badge className={statusStyles[status]}>{statusLabels[status]}</Badge>
        </div>

        {status === "not_started" && (
          <p className="text-sm">
            Set up payouts with Stripe to receive client payments in your bank account. It takes about five minutes:
            Stripe asks for your contact details, ID and bank account.
          </p>
        )}
        {status === "pending" && (
          <p className="text-sm">
            Stripe still needs some details, or is checking the ones you sent. Continue setup to see what&apos;s
            missing. We&apos;ll let you know when payouts are switched on.
          </p>
        )}
        {status === "active" && (
          <p className="text-sm">
            You&apos;re all set. Client payments go to your Stripe account, minus the platform fee, and Stripe pays
            them into your bank on a rolling schedule.
          </p>
        )}

        {!stripeOn && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-subtle">
            {status === "active"
              ? "Simulated: card payments aren't switched on for this site, so payouts are simulated and no real money moves."
              : "Card payments aren't switched on for this site, so payouts are simulated: setting up marks your account as connected straight away and no real money moves."}
          </p>
        )}

        {status === "not_started" && <PayoutsSetupForm label="Set up payouts" simulated={!stripeOn} />}
        {status === "pending" && <PayoutsSetupForm label="Continue setup" simulated={!stripeOn} />}
        {status === "active" && stripeOn && !simulatedAccount && (
          <div className="space-y-2">
            <PayoutsDashboardForm />
            <p className="text-xs text-subtle">See your balance, payout schedule and bank details on Stripe.</p>
          </div>
        )}
      </Card>

      {held.length > 0 && (
        <Card className="space-y-2 border-amber-300 dark:border-amber-800">
          <h2 className="font-semibold">Earnings held for you</h2>
          <p className="text-sm">
            We&apos;re holding{" "}
            <strong>{held.map((t) => formatMoney(t.netCents, t.currency)).join(" and ")}</strong> from client payments
            until your payouts are set up.{" "}
            <Link href="/dashboard/earnings" className="font-medium text-brand">
              See earnings
            </Link>
          </p>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">How payouts work</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>Clients pay by card when they book a session or buy a package.</li>
          <li>
            The platform keeps {policy.newClientPercent}% of a new client&apos;s first payment to you and{" "}
            {policy.repeatPercent}% of their payments after that. The rest is yours.
          </li>
          <li>
            Refunds come out of your share. When a payment is refunded in full, the platform fee is returned too.
          </li>
          <li>Until payouts are set up, the platform collects payments and holds your share.</li>
        </ul>
      </Card>
    </div>
  );
}

function OnboardingMessage({ outcome, status }: { outcome?: string; status: PayoutStatus }) {
  if (!outcome) return null;
  if (outcome === "error") {
    return <Alert>We couldn&apos;t check your Stripe account just now. Refresh this page in a minute.</Alert>;
  }
  if (status === "active") return <Alert tone="success">Payouts are set up. You&apos;re ready to get paid.</Alert>;
  if (status === "pending") {
    return (
      <Alert tone="success">
        Thanks! Stripe is checking your details. This can take a few minutes, and we&apos;ll let you know when
        payouts are on.
      </Alert>
    );
  }
  return null;
}
