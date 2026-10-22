import "server-only";
import { db } from "@/lib/db";
import { timeAgo } from "./time-ago";

export type BellItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  /** Formatted on the server, e.g. "5 min ago". */
  time: string;
  createdAt: string;
};

export type NotificationSummary = {
  /** Server time the summary was read, so the bell can keep whichever copy is newest. */
  asOf: number;
  unread: number;
  items: BellItem[];
};

/** Unread count and the latest 10 notifications of one user. */
export async function loadNotificationSummary(userId: string): Promise<NotificationSummary> {
  const [unread, latest] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: { id: true, title: true, body: true, readAt: true, createdAt: true },
    }),
  ]);
  const now = new Date();
  return {
    asOf: now.getTime(),
    unread,
    items: latest.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      read: n.readAt !== null,
      time: timeAgo(n.createdAt, now),
      createdAt: n.createdAt.toISOString(),
    })),
  };
}
