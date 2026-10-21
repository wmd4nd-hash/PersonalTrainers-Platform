import "server-only";
import { db } from "./db";
import { appUrl } from "./stripe";

export type NotifyInput = {
  userId: string;
  /** Machine-readable kind, e.g. "booking.confirmed". */
  type: string;
  title: string;
  body?: string;
  /** App path the notification opens, e.g. "/dashboard/bookings/abc". */
  link?: string;
  /** Also email the user (respects their email preference). */
  email?: boolean;
};

/** Records an in-app notification and, if asked, queues an email. */
export async function notify(input: NotifyInput) {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { email: true, name: true, emailNotifications: true },
  });
  if (!user) return;

  await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      link: input.link ?? "",
    },
  });

  if (input.email && user.emailNotifications) {
    const lines = [`Hi ${user.name},`, "", input.body ?? input.title];
    if (input.link) lines.push("", appUrl(input.link));
    await queueEmail({ to: user.email, subject: input.title, text: lines.join("\n") });
  }
}

export type EmailInput = { to: string; subject: string; text: string; html?: string };

/** Adds an email to the outbox. Delivery happens in `deliverQueuedEmails`. */
export async function queueEmail(email: EmailInput) {
  await db.emailOutbox.create({
    data: { to: email.to, subject: email.subject, text: email.text, html: email.html ?? "" },
  });
}
