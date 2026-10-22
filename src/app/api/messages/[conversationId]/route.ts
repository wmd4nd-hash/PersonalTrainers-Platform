import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { findConversationForUser, loadThreadPage, loadThreadUpdates } from "@/lib/messaging";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Thread data for the conversation page, participants only.
 *   ?since=<ISO time>  messages from about that time onwards, for polling
 *   ?before=<message id>  the page of older messages before that one
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/messages/[conversationId]">) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Log in to see your messages." }, 401);

  const { conversationId } = await ctx.params;
  const conversation = await findConversationForUser(conversationId, user.id);
  if (!conversation) return json({ error: "Conversation not found." }, 404);

  const params = request.nextUrl.searchParams;
  const before = params.get("before");
  if (before) return json(await loadThreadPage(conversation.id, user.id, before));

  const since = new Date(params.get("since") ?? "");
  if (Number.isNaN(since.getTime())) return json({ error: "Pass ?since= or ?before=." }, 400);
  return json(await loadThreadUpdates(conversation.id, user.id, since));
}
