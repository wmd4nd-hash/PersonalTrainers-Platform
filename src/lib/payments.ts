import "server-only";
import { addMinutes } from "date-fns";
import type Stripe from "stripe";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { bookingConfirmed, packageActivated } from "./events";
import { platformFeeCents } from "./fees";
import { formatMoney } from "./money";
import { notify } from "./notify";
import { CHECKOUT_EXPIRY_MINUTES } from "./scheduling";
import { appUrl, getStripe } from "./stripe";

type Tx = Prisma.TransactionClient;

export type PaymentKind = "booking" | "package";

/** True when real card payments are configured. Otherwise payments are simulated. */
export function paymentsEnabled() {
  return getStripe() !== null;
}

/**
 * Whether bookings can be paid at all: with Stripe, or simulated. Simulated
 * payments confirm everything for free, so a production site only allows them
 * when DEMO_MODE=true is set on purpose.
 */
export function simulatedPaymentsAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true";
}

export function canTakePayments() {
  return paymentsEnabled() || simulatedPaymentsAllowed();
}

export class PaymentsUnavailableError extends Error {
  constructor() {
    super("Card payments aren't set up on this site. Set STRIPE_SECRET_KEY, or DEMO_MODE=true for a demo.");
  }
}

function assertSimulationAllowed() {
  if (!simulatedPaymentsAllowed()) throw new PaymentsUnavailableError();
}

/**
 * Ids we make up when Stripe is off ("acct_sim_…" for payout accounts,
 * "pi_sim_…" for payments) so simulated payments look like real ones to the
 * rest of the app. They are never sent to Stripe.
 */
export function isSimulatedId(id: string) {
  return id.startsWith("acct_sim_") || id.startsWith("pi_sim_");
}

function simulatedPaymentId(id: string) {
  return `pi_sim_${id}`;
}

// ---------------------------------------------------------------------------
// Which records count as card payments
// ---------------------------------------------------------------------------

/**
 * Bookings the client paid for by card (or simulated card), including ones
 * cancelled or refunded later. Package sessions and unpaid checkouts are excluded.
 */
export function cardPaidBookingWhere(): Prisma.BookingWhereInput {
  return {
    packagePurchaseId: null,
    OR: [
      { status: { in: ["CONFIRMED", "COMPLETED"] } },
      { stripePaymentIntentId: { not: null } },
      { refundedCents: { gt: 0 } },
    ],
  };
}

/** Package purchases the client paid for, including cancelled or refunded ones. */
export function paidPackageWhere(): Prisma.PackagePurchaseWhereInput {
  return {
    OR: [
      { status: { in: ["ACTIVE", "EXHAUSTED", "EXPIRED"] } },
      { stripePaymentIntentId: { not: null } },
      { refundedCents: { gt: 0 } },
    ],
  };
}

/** A client is "new" to a trainer until they have paid for a session or package with them. */
export async function isNewClient(trainerId: string, clientId: string, client: Tx = db) {
  const [paidBookings, paidPackages] = await Promise.all([
    client.booking.count({
      where: { trainerId, clientId, status: { in: ["CONFIRMED", "COMPLETED"] }, packagePurchaseId: null },
    }),
    client.packagePurchase.count({
      where: { trainerId, clientId, status: { in: ["ACTIVE", "EXHAUSTED", "EXPIRED"] } },
    }),
  ]);
  return paidBookings + paidPackages === 0;
}

// ---------------------------------------------------------------------------
// Trainer payouts (Stripe Connect Express)
// ---------------------------------------------------------------------------

export type PayoutStatus = "not_started" | "pending" | "active";

export type PayoutAccount = {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
};

const payoutAccountSelect = {
  stripeAccountId: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
} satisfies Prisma.TrainerProfileSelect;

/** The trainer's connected account, if it can be used now (simulated accounts don't count once Stripe is on). */
function connectedAccountId(trainer: PayoutAccount, stripeEnabled = paymentsEnabled()): string | null {
  const id = trainer.stripeAccountId;
  if (!id) return null;
  return stripeEnabled && isSimulatedId(id) ? null : id;
}

export function payoutStatus(trainer: PayoutAccount, stripeEnabled = paymentsEnabled()): PayoutStatus {
  if (!connectedAccountId(trainer, stripeEnabled)) return "not_started";
  return trainer.stripeChargesEnabled && trainer.stripePayoutsEnabled ? "active" : "pending";
}

/** Where a new charge should be paid out to, or null if the platform collects it. */
function payoutDestination(trainer: PayoutAccount): string | null {
  const id = connectedAccountId(trainer);
  return id && trainer.stripeChargesEnabled && !isSimulatedId(id) ? id : null;
}

function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  return stripe;
}

/** Without Stripe: marks the trainer as connected so the whole flow can be tried out. */
export async function setUpSimulatedPayouts(trainerId: string) {
  assertSimulationAllowed();
  await db.trainerProfile.update({
    where: { id: trainerId },
    data: { stripeAccountId: `acct_sim_${trainerId}`, stripeChargesEnabled: true, stripePayoutsEnabled: true },
  });
}

/**
 * Creates the trainer's Express account if they don't have one yet and returns
 * a Stripe-hosted onboarding link to send them to.
 */
export async function createPayoutsOnboardingLink(trainerId: string): Promise<string> {
  const stripe = requireStripe();
  const trainer = await db.trainerProfile.findUniqueOrThrow({
    where: { id: trainerId },
    select: { ...payoutAccountSelect, user: { select: { email: true } } },
  });

  let accountId = connectedAccountId(trainer);
  if (!accountId) {
    const account = await stripe.accounts.create(
      {
        // Express: Stripe collects the trainer's details and gives them a light
        // dashboard for balance and payouts; the platform sets the fees.
        type: "express",
        email: trainer.user.email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { trainerId },
      },
      // A double click must not create two accounts.
      { idempotencyKey: `connect-account-${trainerId}` },
    );
    await db.trainerProfile.update({
      where: { id: trainerId },
      data: {
        stripeAccountId: account.id,
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
      },
    });
    accountId = account.id;
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: appUrl("/dashboard/payouts/refresh"),
    return_url: appUrl("/dashboard/payouts/return"),
  });
  return link.url;
}

/** One-time link into the trainer's Stripe Express dashboard (balance, payouts, bank details). */
export async function createPayoutsDashboardLink(trainerId: string): Promise<string> {
  const stripe = requireStripe();
  const trainer = await db.trainerProfile.findUniqueOrThrow({ where: { id: trainerId }, select: payoutAccountSelect });
  const accountId = connectedAccountId(trainer);
  if (!accountId) throw new Error("Payouts are not set up");
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}

/** Re-reads the trainer's account from Stripe (after onboarding) and returns their status. */
export async function syncPayoutsStatus(trainerId: string): Promise<PayoutStatus> {
  const trainer = await db.trainerProfile.findUniqueOrThrow({ where: { id: trainerId }, select: payoutAccountSelect });
  const stripe = getStripe();
  const accountId = connectedAccountId(trainer);
  if (!stripe || !accountId) return payoutStatus(trainer);
  const account = await stripe.accounts.retrieve(accountId);
  await applyAccountUpdate(account);
  return payoutStatus({
    stripeAccountId: account.id,
    stripeChargesEnabled: account.charges_enabled,
    stripePayoutsEnabled: account.payouts_enabled,
  });
}

/**
 * Saves a connected account's capabilities (from `accounts.retrieve` or an
 * `account.updated` event) and tells the trainer when payouts switch on or off.
 */
export async function applyAccountUpdate(
  account: Pick<Stripe.Account, "id" | "charges_enabled" | "payouts_enabled">,
) {
  const trainer = await db.trainerProfile.findUnique({
    where: { stripeAccountId: account.id },
    select: { id: true, userId: true, stripeChargesEnabled: true, stripePayoutsEnabled: true },
  });
  if (!trainer) return;

  const charges = Boolean(account.charges_enabled);
  const payouts = Boolean(account.payouts_enabled);
  // Conditional update so two deliveries of the same change only notify once.
  const { count } = await db.trainerProfile.updateMany({
    where: {
      id: trainer.id,
      OR: [{ stripeChargesEnabled: { not: charges } }, { stripePayoutsEnabled: { not: payouts } }],
    },
    data: { stripeChargesEnabled: charges, stripePayoutsEnabled: payouts },
  });
  if (count === 0) return;

  const wasActive = trainer.stripeChargesEnabled && trainer.stripePayoutsEnabled;
  const isActive = charges && payouts;
  if (isActive && !wasActive) {
    await notify({
      userId: trainer.userId,
      type: "payouts.active",
      title: "Payouts are set up",
      body: "Client payments now go to your Stripe account, minus the platform fee.",
      link: "/dashboard/payouts",
      email: true,
    });
  } else if (!isActive && wasActive) {
    await notify({
      userId: trainer.userId,
      type: "payouts.paused",
      title: "Stripe needs more information",
      body: "Payouts are paused until you update your details with Stripe.",
      link: "/dashboard/payouts",
      email: true,
    });
  }
}

/** The trainer disconnected their account from the platform in Stripe. */
export async function disconnectAccount(accountId: string) {
  await db.trainerProfile.updateMany({
    where: { stripeAccountId: accountId },
    data: { stripeAccountId: null, stripeChargesEnabled: false, stripePayoutsEnabled: false },
  });
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * Starts payment for a PENDING_PAYMENT booking and returns the URL to send the
 * client to. Without Stripe the booking is confirmed straight away.
 *
 * When the trainer has finished payouts setup this is a destination charge: the
 * money goes to the trainer's account and the platform fee comes back to the
 * platform. Otherwise the platform collects it and holds the trainer's share.
 */
export async function beginBookingCheckout(bookingId: string): Promise<string> {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { client: true, trainer: { include: { user: true } } },
  });
  const successPath = `/dashboard/bookings/${bookingId}?booked=1`;
  if (booking.status !== "PENDING_PAYMENT") return successPath;

  const fee = platformFeeCents(booking.priceCents, {
    isNewClient: await isNewClient(booking.trainerId, booking.clientId),
  });
  await db.booking.update({ where: { id: bookingId }, data: { platformFeeCents: fee } });

  const stripe = getStripe();
  if (!stripe) {
    assertSimulationAllowed();
    await markBookingPaid(bookingId, { paymentIntentId: simulatedPaymentId(bookingId) });
    return successPath;
  }

  const metadata = { kind: "booking", bookingId };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Cards settle straight away; slower methods would outlast the slot hold.
    allowed_payment_method_types: ["card"],
    customer_email: booking.client.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: booking.currency,
          unit_amount: booking.priceCents,
          product_data: {
            name: `${booking.trainer.sessionMinutes}-minute session with ${booking.trainer.user.name}`,
          },
        },
      },
    ],
    metadata,
    payment_intent_data: paymentIntentData(booking.trainer, fee, metadata),
    expires_at: Math.floor(addMinutes(new Date(), CHECKOUT_EXPIRY_MINUTES).getTime() / 1000),
    success_url: appUrl(successPath),
    cancel_url: appUrl(`/trainers/${booking.trainerId}?cancelled=1`),
  });
  await db.booking.update({ where: { id: bookingId }, data: { stripeCheckoutSessionId: session.id } });
  return session.url!;
}

/** Starts payment for a PENDING_PAYMENT package purchase; returns the redirect URL. */
export async function beginPackageCheckout(purchaseId: string): Promise<string> {
  const purchase = await db.packagePurchase.findUniqueOrThrow({
    where: { id: purchaseId },
    include: { client: true, package: true, trainer: { include: { user: true } } },
  });
  const successPath = `/dashboard/packages?purchased=${purchaseId}`;
  if (purchase.status !== "PENDING_PAYMENT") return successPath;

  const fee = platformFeeCents(purchase.priceCents, {
    isNewClient: await isNewClient(purchase.trainerId, purchase.clientId),
  });
  await db.packagePurchase.update({ where: { id: purchaseId }, data: { platformFeeCents: fee } });

  const stripe = getStripe();
  if (!stripe) {
    assertSimulationAllowed();
    await markPackagePaid(purchaseId, { paymentIntentId: simulatedPaymentId(purchaseId) });
    return successPath;
  }

  const metadata = { kind: "package", purchaseId };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Cards settle straight away; slower methods would outlast the slot hold.
    allowed_payment_method_types: ["card"],
    customer_email: purchase.client.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: purchase.currency,
          unit_amount: purchase.priceCents,
          product_data: { name: `${purchase.package.title} with ${purchase.trainer.user.name}` },
        },
      },
    ],
    metadata,
    payment_intent_data: paymentIntentData(purchase.trainer, fee, metadata),
    expires_at: Math.floor(addMinutes(new Date(), CHECKOUT_EXPIRY_MINUTES).getTime() / 1000),
    success_url: appUrl(successPath),
    cancel_url: appUrl(`/trainers/${purchase.trainerId}?cancelled=1`),
  });
  await db.packagePurchase.update({
    where: { id: purchaseId },
    data: { stripeCheckoutSessionId: session.id },
  });
  return session.url!;
}

function paymentIntentData(
  trainer: PayoutAccount,
  feeCents: number,
  metadata: Record<string, string>,
): Stripe.Checkout.SessionCreateParams.PaymentIntentData {
  const destination = payoutDestination(trainer);
  if (!destination) return { metadata };
  return {
    metadata,
    transfer_data: { destination },
    ...(feeCents > 0 && { application_fee_amount: feeCents }),
  };
}

/** Lets an open Checkout session lapse so a cancelled booking can't be paid. Best effort. */
export async function expireCheckout(checkoutSessionId: string | null) {
  const stripe = getStripe();
  if (!stripe || !checkoutSessionId) return;
  try {
    await stripe.checkout.sessions.expire(checkoutSessionId);
  } catch {
    // Already completed or expired. A late payment is refunded by markBookingPaid.
  }
}

type PaymentIds = { checkoutSessionId?: string; paymentIntentId?: string };

function paymentIdsData(ids: PaymentIds) {
  return {
    ...(ids.checkoutSessionId && { stripeCheckoutSessionId: ids.checkoutSessionId }),
    ...(ids.paymentIntentId && { stripePaymentIntentId: ids.paymentIntentId }),
  };
}

/**
 * Marks a booking paid (idempotent) and fires the confirmation event. If the
 * booking was cancelled while the client was still in checkout, the payment is
 * recorded and refunded in full instead.
 */
export async function markBookingPaid(bookingId: string, ids: PaymentIds) {
  const { count } = await db.booking.updateMany({
    where: { id: bookingId, status: "PENDING_PAYMENT" },
    data: { status: "CONFIRMED", ...paymentIdsData(ids) },
  });
  if (count > 0) {
    await bookingConfirmed(bookingId);
    return;
  }
  if (!ids.paymentIntentId) return;
  const { count: late } = await db.booking.updateMany({
    where: { id: bookingId, status: "CANCELLED", stripePaymentIntentId: null },
    data: paymentIdsData(ids),
  });
  if (late > 0) await refundLatePayment("booking", bookingId);
}

/** Marks a package purchase paid (idempotent); refunds it if it was cancelled during checkout. */
export async function markPackagePaid(purchaseId: string, ids: PaymentIds) {
  const { count } = await db.packagePurchase.updateMany({
    where: { id: purchaseId, status: "PENDING_PAYMENT" },
    data: { status: "ACTIVE", ...paymentIdsData(ids) },
  });
  if (count > 0) {
    await packageActivated(purchaseId);
    return;
  }
  if (!ids.paymentIntentId) return;
  const { count: late } = await db.packagePurchase.updateMany({
    where: { id: purchaseId, status: "CANCELLED", stripePaymentIntentId: null },
    data: paymentIdsData(ids),
  });
  if (late > 0) await refundLatePayment("package", purchaseId);
}

async function refundLatePayment(kind: PaymentKind, id: string) {
  try {
    await refundPayment(kind, id, Number.MAX_SAFE_INTEGER);
  } catch (err) {
    // Admins have been told. Retrying the webhook wouldn't help: the payment is recorded now.
    if (!(err instanceof RefundError)) throw err;
  }
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

/** Stripe refused or failed a refund. Admins have been told; nothing was recorded as refunded. */
export class RefundError extends Error {}

type RefundablePayment = {
  priceCents: number;
  refundedCents: number;
  currency: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
};

const refundableSelect = {
  priceCents: true,
  refundedCents: true,
  currency: true,
  stripePaymentIntentId: true,
  stripeCheckoutSessionId: true,
} as const;

type PaymentLedger = {
  load(id: string): Promise<RefundablePayment>;
  /** Compare-and-set on refundedCents; false if someone else changed it first. */
  setRefunded(id: string, from: number, to: number): Promise<boolean>;
};

const ledgers: Record<PaymentKind, PaymentLedger> = {
  booking: {
    load: (id) => db.booking.findUniqueOrThrow({ where: { id }, select: refundableSelect }),
    setRefunded: async (id, from, to) =>
      (await db.booking.updateMany({ where: { id, refundedCents: from }, data: { refundedCents: to } })).count > 0,
  },
  package: {
    load: (id) => db.packagePurchase.findUniqueOrThrow({ where: { id }, select: refundableSelect }),
    setRefunded: async (id, from, to) =>
      (await db.packagePurchase.updateMany({ where: { id, refundedCents: from }, data: { refundedCents: to } }))
        .count > 0,
  },
};

/**
 * Refunds part or all of a card-paid booking and returns the cents refunded.
 * Never refunds more than was paid, however often it is called. No-op for 0.
 * Throws RefundError if Stripe refuses the refund.
 */
export async function refundBooking(bookingId: string, amountCents: number): Promise<number> {
  return refundPayment("booking", bookingId, amountCents);
}

/** Same as refundBooking, for a package purchase. */
export async function refundPackage(purchaseId: string, amountCents: number): Promise<number> {
  return refundPayment("package", purchaseId, amountCents);
}

async function refundPayment(kind: PaymentKind, id: string, requestedCents: number): Promise<number> {
  if (!(requestedCents > 0)) return 0;
  const ledger = ledgers[kind];

  for (let attempt = 0; attempt < 3; attempt++) {
    const payment = await ledger.load(id);
    const amount = Math.min(requestedCents, payment.priceCents - payment.refundedCents);
    if (amount <= 0) return 0;
    const before = payment.refundedCents;
    const after = before + amount;

    // Record the refund before asking Stripe, so a repeated or concurrent call
    // can never send the same money back twice. Undone if Stripe says no.
    if (!(await ledger.setRefunded(id, before, after))) continue;
    try {
      await sendRefund({ kind, id, payment, amount, before, after });
    } catch (err) {
      await ledger.setRefunded(id, after, before);
      await reportRefundFailure(kind, id, formatMoney(amount, payment.currency), err);
      throw new RefundError(`Refund of ${kind} ${id} failed`, { cause: err });
    }
    return amount;
  }

  const err = new RefundError(`Refund of ${kind} ${id} kept clashing with another update`);
  await reportRefundFailure(kind, id, null, err);
  throw err;
}

type RefundRequest = {
  kind: PaymentKind;
  id: string;
  payment: RefundablePayment;
  amount: number;
  /** refundedCents before and after this refund */
  before: number;
  after: number;
};

/** The parameters for `refunds.create`, given what kind of charge it was. */
export function refundParams(
  r: { kind: PaymentKind; id: string; paymentIntentId: string; amount: number; after: number; totalCents: number },
  destinationCharge: boolean,
): Stripe.RefundCreateParams {
  const full = r.after >= r.totalCents;
  return {
    payment_intent: r.paymentIntentId,
    amount: r.amount,
    // Destination charge: take the money back from the trainer's account, and
    // give the platform fee back only when the client gets everything back.
    ...(destinationCharge && { reverse_transfer: true, refund_application_fee: full }),
    metadata: { kind: r.kind, [r.kind === "booking" ? "bookingId" : "purchaseId"]: r.id },
  };
}

async function sendRefund(r: RefundRequest) {
  const stripe = getStripe();
  if (!stripe) return; // simulated payments: recording the refund is all there is to do

  let paymentIntentId = r.payment.stripePaymentIntentId;
  if (paymentIntentId && isSimulatedId(paymentIntentId)) return; // paid while Stripe was off
  if (!paymentIntentId && r.payment.stripeCheckoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(r.payment.stripeCheckoutSessionId);
    paymentIntentId = idOf(session.payment_intent);
  }
  if (!paymentIntentId) throw new Error("No Stripe payment found to refund");

  // Ask Stripe how the charge was made: the trainer may have set up payouts after paying.
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const destinationCharge = Boolean(intent.transfer_data?.destination);
  const params = refundParams(
    { kind: r.kind, id: r.id, paymentIntentId, amount: r.amount, after: r.after, totalCents: r.payment.priceCents },
    destinationCharge,
  );
  await stripe.refunds.create(params, { idempotencyKey: `refund-${r.kind}-${r.id}-${r.after}` });

  // Stripe returns the application fee in proportion to each refund. If an
  // earlier partial refund kept the fee, give back the rest now it's all refunded.
  if (destinationCharge && params.refund_application_fee && r.before > 0) {
    await refundRemainingApplicationFee(stripe, intent, r).catch((err) =>
      console.error(`Could not return the rest of the platform fee for ${r.kind} ${r.id}`, err),
    );
  }
}

async function refundRemainingApplicationFee(stripe: Stripe, intent: Stripe.PaymentIntent, r: RefundRequest) {
  const chargeId = idOf(intent.latest_charge);
  if (!chargeId) return;
  const charge = await stripe.charges.retrieve(chargeId);
  const feeId = idOf(charge.application_fee);
  if (!feeId) return;
  const fee = await stripe.applicationFees.retrieve(feeId);
  const remaining = fee.amount - fee.amount_refunded;
  if (remaining > 0) {
    await stripe.applicationFees.createRefund(
      feeId,
      { amount: remaining },
      { idempotencyKey: `fee-refund-${r.kind}-${r.id}` },
    );
  }
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function reportRefundFailure(kind: PaymentKind, id: string, amount: string | null, err: unknown) {
  console.error(`Refund of ${kind} ${id} failed`, err);
  try {
    const admins = await db.user.findMany({ where: { role: "ADMIN", suspendedAt: null }, select: { id: true } });
    const what = kind === "booking" ? `booking ${id}` : `package purchase ${id}`;
    for (const admin of admins) {
      await notify({
        userId: admin.id,
        type: "payment.refund_failed",
        title: "A refund needs attention",
        body: `We couldn't refund ${amount ?? "the payment"} for ${what}. Refund it from the Stripe dashboard; our records update automatically.`,
        link: "/admin/bookings",
        email: true,
      });
    }
  } catch (notifyErr) {
    console.error("Could not tell admins about the failed refund", notifyErr);
  }
}

/**
 * Brings our record up to date with refunds made in Stripe (e.g. from the
 * dashboard). Only ever raises refundedCents: refunds we start are recorded
 * before Stripe confirms them.
 */
export async function syncRefundedCents(paymentIntentId: string, refundedCents: number) {
  const where = { stripePaymentIntentId: paymentIntentId, refundedCents: { lt: refundedCents } };
  const [bookings, packages] = await Promise.all([
    db.booking.updateMany({ where, data: { refundedCents } }),
    db.packagePurchase.updateMany({ where, data: { refundedCents } }),
  ]);
  return bookings.count + packages.count;
}
