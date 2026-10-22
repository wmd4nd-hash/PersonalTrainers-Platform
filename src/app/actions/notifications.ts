"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { idSchema, safeInternalPath } from "@/lib/validation/notifications";

// Every action here only touches the signed-in user's own notifications: the
// id from the client is always combined with userId from the session.

export async function markNotificationRead(notificationId: string) {
  const user = await requireUser();
  const id = idSchema.safeParse(notificationId);
  if (!id.success) return;
  await db.notification.updateMany({
    where: { id: id.data, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  refresh();
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  refresh();
}

/** Marks a notification read and goes to the page it's about. */
export async function openNotification(notificationId: string) {
  const user = await requireUser();
  const id = idSchema.safeParse(notificationId);
  const notification = id.success
    ? await db.notification.findFirst({
        where: { id: id.data, userId: user.id },
        select: { id: true, link: true, readAt: true },
      })
    : null;
  if (!notification) redirect("/dashboard/notifications");

  if (!notification.readAt) {
    await db.notification.updateMany({
      where: { id: notification.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }
  redirect(safeInternalPath(notification.link) ?? "/dashboard/notifications");
}
