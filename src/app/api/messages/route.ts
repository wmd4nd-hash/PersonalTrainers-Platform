import { getCurrentUser } from "@/lib/auth";
import { countUnreadMessages } from "@/lib/messaging";

/** The signed-in user's unread message count, for the header badge. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in to see your messages." }, { status: 401 });
  const unread = user.role === "ADMIN" ? 0 : await countUnreadMessages(user.id);
  return Response.json({ unread }, { headers: { "Cache-Control": "private, no-store" } });
}
