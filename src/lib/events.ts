import "server-only";
import { db } from "./db";
import { formatMoney } from "./money";
import { notify } from "./notify";
import { formatSlot } from "./scheduling";

/**
 * Domain events. Features call these after a state change; this module decides
 * who is told and how. Keep side effects (notifications, emails) here.
 */

export async function bookingConfirmed(bookingId: string) {
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    include: { client: true, trainer: { include: { user: true } } },
  });
  if (!b) return;
  const when = formatSlot(b.startsAt, b.trainer.timezone);
  const link = `/dashboard/bookings/${b.id}`;
  await notify({
    userId: b.clientId,
    type: "booking.confirmed",
    title: `Session booked with ${b.trainer.user.name}`,
    body: `Your session on ${when} is confirmed.`,
    link,
    email: true,
  });
  await notify({
    userId: b.trainer.userId,
    type: "booking.confirmed",
    title: `New booking from ${b.client.name}`,
    body: `${b.client.name} booked ${when}.`,
    link,
    email: true,
  });
}

export async function bookingCancelled(bookingId: string, { refundCents }: { refundCents: number }) {
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    include: { client: true, trainer: { include: { user: true } } },
  });
  if (!b) return;
  const when = formatSlot(b.startsAt, b.trainer.timezone);
  const link = `/dashboard/bookings/${b.id}`;
  const refund = refundCents > 0 ? ` A refund of ${formatMoney(refundCents, b.currency)} is on its way.` : "";
  const byTrainer = b.cancelledById === b.trainer.userId;
  await notify({
    userId: b.clientId,
    type: "booking.cancelled",
    title: byTrainer ? `${b.trainer.user.name} cancelled your session` : "Your session was cancelled",
    body: `The session on ${when} was cancelled.${refund}`,
    link,
    email: true,
  });
  await notify({
    userId: b.trainer.userId,
    type: "booking.cancelled",
    title: byTrainer ? "You cancelled a session" : `${b.client.name} cancelled a session`,
    body: `The session on ${when} was cancelled.`,
    link,
    email: !byTrainer,
  });
}

export async function packageActivated(purchaseId: string) {
  const p = await db.packagePurchase.findUnique({
    where: { id: purchaseId },
    include: { package: true, client: true, trainer: { include: { user: true } } },
  });
  if (!p) return;
  await notify({
    userId: p.clientId,
    type: "package.activated",
    title: `${p.package.title} is ready to use`,
    body: `You have ${p.sessionsTotal} sessions with ${p.trainer.user.name}.`,
    link: "/dashboard/packages",
    email: true,
  });
  await notify({
    userId: p.trainer.userId,
    type: "package.activated",
    title: `${p.client.name} bought ${p.package.title}`,
    body: `${formatMoney(p.priceCents, p.currency)} for ${p.sessionsTotal} sessions.`,
    link: "/dashboard/packages",
    email: true,
  });
}

export async function reviewPosted(reviewId: string) {
  const r = await db.review.findUnique({
    where: { id: reviewId },
    include: { client: true, trainer: true },
  });
  if (!r) return;
  await notify({
    userId: r.trainer.userId,
    type: "review.posted",
    title: `${r.client.name} left you a ${r.rating}-star review`,
    body: r.comment,
    link: "/dashboard/reviews",
    email: true,
  });
}

export async function messageSent(messageId: string) {
  const m = await db.message.findUnique({
    where: { id: messageId },
    include: { sender: true, conversation: { include: { trainer: true } } },
  });
  if (!m) return;
  const recipientId =
    m.senderId === m.conversation.clientId ? m.conversation.trainer.userId : m.conversation.clientId;
  await notify({
    userId: recipientId,
    type: "message.received",
    title: `New message from ${m.sender.name}`,
    body: m.body.slice(0, 200),
    link: `/dashboard/messages/${m.conversationId}`,
    email: true,
  });
}

export async function documentReviewed(documentId: string) {
  const d = await db.verificationDocument.findUnique({
    where: { id: documentId },
    include: { trainer: true },
  });
  if (!d) return;
  const approved = d.status === "APPROVED";
  await notify({
    userId: d.trainer.userId,
    type: "verification.document",
    title: approved ? "Document approved" : "Document needs attention",
    body: approved ? "Your document was approved." : d.reviewerNote || "Your document was not accepted.",
    link: "/dashboard/verification",
    email: true,
  });
}
