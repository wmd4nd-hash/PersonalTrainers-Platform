import "server-only";
import type { DocumentKind } from "@/generated/prisma/client";
import { describePolicy } from "./cancellation";
import { db } from "./db";
import {
  bookingCancelledEmail,
  bookingConfirmedClientEmail,
  bookingConfirmedTrainerEmail,
  bookingReminderEmail,
  documentReviewedEmail,
  messageReceivedEmail,
  packageActivatedClientEmail,
  packageActivatedTrainerEmail,
  reviewPostedEmail,
  stars,
  truncate,
  type CancelledBy,
  type SessionInfo,
} from "./email/templates";
import { emailEnv } from "./email/transport";
import { formatMoney } from "./money";
import { notify } from "./notify";
import { formatSlot } from "./scheduling";

/**
 * Domain events. Features call these after a state change; this module decides
 * who is told and how. Keep side effects (notifications, emails) here.
 */

const bookingInclude = {
  client: { select: { name: true } },
  trainer: { include: { user: { select: { name: true } } } },
  packagePurchase: { include: { package: { select: { title: true } } } },
} as const;

function loadBooking(bookingId: string) {
  return db.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
}

type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

function sessionInfo(b: LoadedBooking): SessionInfo {
  return {
    bookingId: b.id,
    when: formatSlot(b.startsAt, b.trainer.timezone),
    minutes: Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000),
    format: b.format,
    location: b.location,
    meetingUrl: b.meetingUrl,
  };
}

function paymentLabel(b: LoadedBooking): string {
  return b.packagePurchase
    ? `1 session from ${b.packagePurchase.package.title}`
    : `${formatMoney(b.priceCents, b.currency)} by card`;
}

export async function bookingConfirmed(bookingId: string) {
  const b = await loadBooking(bookingId);
  if (!b) return;
  const env = emailEnv();
  const session = sessionInfo(b);
  const trainerName = b.trainer.user.name;
  const link = `/dashboard/bookings/${b.id}`;

  await notify({
    userId: b.clientId,
    type: "booking.confirmed",
    title: `Session booked with ${trainerName}`,
    body: `Your session on ${session.when} is confirmed.`,
    link,
    email: true,
    emailContent: (r) =>
      bookingConfirmedClientEmail(
        {
          recipientName: r.name,
          trainerName,
          session,
          payment: paymentLabel(b),
          policy: describePolicy(b.trainer.cancellationWindowHours, b.trainer.lateCancelFeePercent),
        },
        env,
      ),
  });
  await notify({
    userId: b.trainer.userId,
    type: "booking.confirmed",
    title: `New booking from ${b.client.name}`,
    body: `${b.client.name} booked ${session.when}.`,
    link,
    email: true,
    emailContent: (r) =>
      bookingConfirmedTrainerEmail(
        { recipientName: r.name, clientName: b.client.name, session, payment: paymentLabel(b), notes: b.notes },
        env,
      ),
  });
}

export async function bookingCancelled(bookingId: string, { refundCents }: { refundCents: number }) {
  const b = await loadBooking(bookingId);
  if (!b) return;
  const env = emailEnv();
  const session = sessionInfo(b);
  const trainerName = b.trainer.user.name;
  const link = `/dashboard/bookings/${b.id}`;

  const byClient = b.cancelledById === b.clientId;
  const byTrainer = b.cancelledById === b.trainer.userId;
  const refund = refundCents > 0 ? formatMoney(refundCents, b.currency) : null;
  // Whatever wasn't refunded of a card payment was kept as a late-cancellation fee.
  // refundedCents may or may not include this refund yet, hence the max().
  const keptCents = b.packagePurchaseId ? 0 : Math.max(0, b.priceCents - Math.max(b.refundedCents, refundCents));
  const kept = keptCents > 0 ? formatMoney(keptCents, b.currency) : null;
  const common = { session, reason: b.cancellationReason, refund, kept, packageSession: Boolean(b.packagePurchaseId) };

  const clientSees: CancelledBy = byClient ? "you" : byTrainer ? "them" : "admin";
  await notify({
    userId: b.clientId,
    type: "booking.cancelled",
    title: byTrainer
      ? `${trainerName} cancelled your session`
      : byClient
        ? "You cancelled a session"
        : "Your session was cancelled",
    body: `The session on ${session.when} was cancelled.${refund ? ` A refund of ${refund} is on its way.` : ""}`,
    link,
    email: true,
    emailContent: (r) =>
      bookingCancelledEmail(
        { ...common, recipientName: r.name, audience: "client", otherName: trainerName, cancelledBy: clientSees },
        env,
      ),
  });

  const trainerSees: CancelledBy = byTrainer ? "you" : byClient ? "them" : "admin";
  await notify({
    userId: b.trainer.userId,
    type: "booking.cancelled",
    title: byTrainer ? "You cancelled a session" : byClient ? `${b.client.name} cancelled a session` : "A session was cancelled",
    body: `The session on ${session.when} was cancelled.`,
    link,
    // Trainers don't need an email about a cancellation they made themselves.
    email: !byTrainer,
    emailContent: (r) =>
      bookingCancelledEmail(
        { ...common, recipientName: r.name, audience: "trainer", otherName: b.client.name, cancelledBy: trainerSees },
        env,
      ),
  });
}

/** The day-before reminder, sent by /api/cron/reminders. */
export async function bookingReminder(bookingId: string) {
  const b = await loadBooking(bookingId);
  if (!b || b.status !== "CONFIRMED") return;
  const env = emailEnv();
  const session = sessionInfo(b);
  const trainerName = b.trainer.user.name;
  const link = `/dashboard/bookings/${b.id}`;

  await notify({
    userId: b.clientId,
    type: "booking.reminder",
    title: `Tomorrow: session with ${trainerName}`,
    body: `${session.when}. ${session.format === "ONLINE" ? "Online video call." : session.location || "In person."}`,
    link,
    email: true,
    emailContent: (r) =>
      bookingReminderEmail({ recipientName: r.name, audience: "client", otherName: trainerName, session }, env),
  });
  await notify({
    userId: b.trainer.userId,
    type: "booking.reminder",
    title: `Tomorrow: session with ${b.client.name}`,
    body: `${session.when}.`,
    link,
    email: true,
    emailContent: (r) =>
      bookingReminderEmail({ recipientName: r.name, audience: "trainer", otherName: b.client.name, session }, env),
  });
}

export async function packageActivated(purchaseId: string) {
  const p = await db.packagePurchase.findUnique({
    where: { id: purchaseId },
    include: {
      package: true,
      client: { select: { name: true } },
      trainer: { include: { user: { select: { name: true } } } },
    },
  });
  if (!p) return;
  const env = emailEnv();
  const price = formatMoney(p.priceCents, p.currency);
  const expiresOn = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: p.trainer.timezone }).format(
    p.expiresAt,
  );

  await notify({
    userId: p.clientId,
    type: "package.activated",
    title: `${p.package.title} is ready to use`,
    body: `You have ${p.sessionsTotal} sessions with ${p.trainer.user.name}.`,
    link: "/dashboard/packages",
    email: true,
    emailContent: (r) =>
      packageActivatedClientEmail(
        {
          recipientName: r.name,
          trainerName: p.trainer.user.name,
          trainerId: p.trainerId,
          packageTitle: p.package.title,
          sessions: p.sessionsTotal,
          price,
          expiresOn,
        },
        env,
      ),
  });
  await notify({
    userId: p.trainer.userId,
    type: "package.activated",
    title: `${p.client.name} bought ${p.package.title}`,
    body: `${price} for ${p.sessionsTotal} sessions.`,
    link: "/dashboard/packages",
    email: true,
    emailContent: (r) =>
      packageActivatedTrainerEmail(
        { recipientName: r.name, clientName: p.client.name, packageTitle: p.package.title, sessions: p.sessionsTotal, price },
        env,
      ),
  });
}

export async function reviewPosted(reviewId: string) {
  const r = await db.review.findUnique({
    where: { id: reviewId },
    include: { client: { select: { name: true } }, trainer: { select: { userId: true } } },
  });
  if (!r) return;
  const env = emailEnv();
  await notify({
    userId: r.trainer.userId,
    type: "review.posted",
    title: `${r.client.name} left you a ${r.rating}-star review`,
    body: r.comment ? truncate(r.comment, 200) : stars(r.rating),
    link: "/dashboard/reviews",
    email: true,
    emailContent: (recipient) =>
      reviewPostedEmail(
        { recipientName: recipient.name, clientName: r.client.name, rating: r.rating, comment: r.comment },
        env,
      ),
  });
}

/** Tells the client when a trainer first replies to their review (in-app only). */
export async function reviewReplied(reviewId: string) {
  const r = await db.review.findUnique({
    where: { id: reviewId },
    include: { trainer: { select: { user: { select: { name: true } } } } },
  });
  if (!r || !r.trainerReply || r.hidden) return;
  await notify({
    userId: r.clientId,
    type: "review.replied",
    title: `${r.trainer.user.name} replied to your review`,
    body: truncate(r.trainerReply, 200),
    link: `/trainers/${r.trainerId}/reviews`,
  });
}

/** Quiet period for message emails: one email per conversation while earlier ones are unread. */
const MESSAGE_EMAIL_COOLDOWN_MS = 15 * 60_000;

export async function messageSent(messageId: string) {
  const m = await db.message.findUnique({
    where: { id: messageId },
    include: { sender: { select: { name: true } }, conversation: { include: { trainer: { select: { userId: true } } } } },
  });
  if (!m) return;
  const recipientId =
    m.senderId === m.conversation.clientId ? m.conversation.trainer.userId : m.conversation.clientId;
  const link = `/dashboard/messages/${m.conversationId}`;

  // Don't email for every line of a conversation: skip the email while the
  // recipient still has a recent unread notification for this conversation.
  const recentUnread = await db.notification.findFirst({
    where: {
      userId: recipientId,
      type: "message.received",
      link,
      readAt: null,
      createdAt: { gt: new Date(Date.now() - MESSAGE_EMAIL_COOLDOWN_MS) },
    },
    select: { id: true },
  });

  // Flagged messages look like they share contact or payment details; don't
  // copy those into notifications and emails that live outside the platform.
  const preview = m.flagged ? "Open the conversation on the platform to read it." : m.body;
  const env = emailEnv();
  await notify({
    userId: recipientId,
    type: "message.received",
    title: `New message from ${m.sender.name}`,
    body: truncate(preview, 200),
    link,
    email: !recentUnread,
    emailContent: (r) =>
      messageReceivedEmail({ recipientName: r.name, senderName: m.sender.name, preview, link }, env),
  });
}

const documentLabels: Record<DocumentKind, string> = {
  CERTIFICATION: "certification",
  INSURANCE: "insurance document",
  IDENTITY: "ID document",
  OTHER: "document",
};

export async function documentReviewed(documentId: string) {
  const d = await db.verificationDocument.findUnique({
    where: { id: documentId },
    include: { trainer: { select: { userId: true } } },
  });
  if (!d) return;
  const env = emailEnv();
  const approved = d.status === "APPROVED";
  const label = documentLabels[d.kind];
  await notify({
    userId: d.trainer.userId,
    type: "verification.document",
    title: approved ? "Document approved" : "Document needs attention",
    body: approved ? `Your ${label} was approved.` : d.reviewerNote || `Your ${label} was not accepted.`,
    link: "/dashboard/verification",
    email: true,
    emailContent: (r) =>
      documentReviewedEmail({ recipientName: r.name, approved, documentLabel: label, note: d.reviewerNote }, env),
  });
}
