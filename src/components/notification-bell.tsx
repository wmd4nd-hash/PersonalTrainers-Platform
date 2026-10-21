import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NotificationMenu } from "./notifications/notification-menu";
import { timeAgo } from "./notifications/time-ago";

/** Header bell with the unread count and the latest notifications. Renders inside the header's Suspense. */
export async function NotificationBell() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [unread, latest] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: { id: true, title: true, body: true, readAt: true, createdAt: true },
    }),
  ]);

  const now = new Date();
  return (
    <NotificationMenu
      unread={unread}
      items={latest.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        read: n.readAt !== null,
        time: timeAgo(n.createdAt, now),
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  );
}
