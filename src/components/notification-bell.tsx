import { getCurrentUser } from "@/lib/auth";
import { NotificationMenu } from "./notifications/notification-menu";
import { loadNotificationSummary } from "./notifications/summary";

/** Header bell with the unread count and the latest notifications. Renders inside the header's Suspense. */
export async function NotificationBell() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <NotificationMenu initial={await loadNotificationSummary(user.id)} />;
}
