import { loadNotificationSummary } from "@/components/notifications/summary";
import { getCurrentUser } from "@/lib/auth";

/** The signed-in user's unread count and latest notifications, for the header bell to stay current. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json(await loadNotificationSummary(user.id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
