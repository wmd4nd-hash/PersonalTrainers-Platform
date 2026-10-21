import "server-only";
import { db } from "./db";
import type { EmailContent } from "./email/layout";
import { notificationEmail } from "./email/templates";
import { deliverSoon, emailEnv } from "./email/transport";

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
  /**
   * Builds a tailored email (see lib/email/templates.ts). Without it the email
   * is a branded version of title, body and link.
   */
  emailContent?: (recipient: { name: string; email: string }) => EmailContent;
};

/** Records an in-app notification and, if asked, queues an email. */
export async function notify(input: NotifyInput) {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { email: true, name: true, emailNotifications: true, suspendedAt: true },
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

  if (input.email && user.emailNotifications && !user.suspendedAt) {
    const recipient = { name: user.name, email: user.email };
    const content =
      input.emailContent?.(recipient) ??
      notificationEmail({ recipientName: user.name, title: input.title, body: input.body, link: input.link }, emailEnv());
    await queueEmail({ to: user.email, ...content });
  }
}

export type EmailInput = { to: string; subject: string; text: string; html?: string };

/**
 * Adds an email to the outbox and schedules delivery for after the current
 * response. The deliver-email cron sends anything left behind.
 */
export async function queueEmail(email: EmailInput) {
  const row = await db.emailOutbox.create({
    data: { to: email.to, subject: email.subject, text: email.text, html: email.html ?? "" },
    select: { id: true },
  });
  deliverSoon();
  return row.id;
}
