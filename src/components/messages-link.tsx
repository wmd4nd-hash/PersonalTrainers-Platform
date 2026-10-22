import { MessagesLinkBadge } from "@/app/dashboard/messages/_components/messages-link-badge";
import { getCurrentUser } from "@/lib/auth";
import { countUnreadMessages } from "@/lib/messaging";

/** Header link to the inbox with an unread badge, for clients and trainers. */
export async function MessagesLink() {
  const user = await getCurrentUser();
  if (!user || user.role === "ADMIN") return null;
  const unread = await countUnreadMessages(user.id);
  return <MessagesLinkBadge initialUnread={unread} />;
}
