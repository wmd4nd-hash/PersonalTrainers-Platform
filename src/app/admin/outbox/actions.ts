"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { deliverQueuedEmails } from "@/lib/email/transport";
import { queueEmail } from "@/lib/notify";
import { idSchema } from "@/lib/validation/notifications";

/** Queues a fresh copy of an email (the original keeps its history) and opens it. */
export async function resendEmail(emailId: string) {
  await requireAdmin();
  const id = idSchema.safeParse(emailId);
  const original = id.success ? await db.emailOutbox.findUnique({ where: { id: id.data } }) : null;
  if (!original) redirect("/admin/outbox");

  const copyId = await queueEmail({
    to: original.to,
    subject: original.subject,
    text: original.text,
    html: original.html,
  });
  redirect(`/admin/outbox/${copyId}?resent=1`);
}

/** Sends everything that's queued now, instead of waiting for the cron job. */
export async function deliverQueuedNow() {
  await requireAdmin();
  await deliverQueuedEmails(100);
  refresh();
}
