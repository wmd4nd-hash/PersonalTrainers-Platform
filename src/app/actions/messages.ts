"use server";

import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { requireRole, requireTrainerProfileId, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MessageRateLimitError,
  canTrainerMessageClient,
  conversationPath,
  findConversationForUser,
  findOrCreateConversation,
  markConversationRead as markRead,
  notifyMessageRecipient,
  otherParticipant,
  postMessage,
  toThreadMessage,
  type ThreadMessage,
} from "@/lib/messaging";
import { formToObject } from "@/lib/validation";
import { messageSchema } from "@/lib/validation/messaging";

export type SendMessageResult = { ok: true; message: ThreadMessage } | { ok: false; error: string };

/** Ids arrive from the browser; anything that isn't a plausible id is treated as missing. */
function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

/**
 * Opens the signed-in client's conversation with a trainer, starting one if
 * needed. Use as a form action: `getOrCreateConversation.bind(null, trainerId)`.
 */
export async function getOrCreateConversation(trainerId: string, _formData?: FormData) {
  const client = await requireRole("CLIENT");
  if (!isId(trainerId)) notFound();

  const existing = await db.conversation.findUnique({
    where: { trainerId_clientId: { trainerId, clientId: client.id } },
    select: { id: true },
  });
  if (existing) redirect(conversationPath(existing.id));

  // New conversations only with trainers who are listed and active.
  const trainer = await db.trainerProfile.findFirst({
    where: { id: trainerId, published: true, user: { suspendedAt: null } },
    select: { id: true },
  });
  if (!trainer) notFound();

  const conversation = await findOrCreateConversation(trainer.id, client.id);
  redirect(conversationPath(conversation.id));
}

/**
 * Opens the signed-in trainer's conversation with a client. Allowed when they
 * already have one, or the client has booked or bought a package with them.
 * Use as a form action: `startConversationWithClient.bind(null, clientId)`.
 */
export async function startConversationWithClient(clientId: string, _formData?: FormData) {
  const trainerId = await requireTrainerProfileId();
  if (!isId(clientId)) notFound();

  const existing = await db.conversation.findUnique({
    where: { trainerId_clientId: { trainerId, clientId } },
    select: { id: true },
  });
  if (existing) redirect(conversationPath(existing.id));

  if (!(await canTrainerMessageClient(trainerId, clientId))) {
    redirect("/dashboard/messages?unavailable=1");
  }
  const conversation = await findOrCreateConversation(trainerId, clientId);
  redirect(conversationPath(conversation.id));
}

/** Sends a message as the signed-in user, who must take part in the conversation. */
export async function sendMessage(conversationId: string, formData: FormData): Promise<SendMessageResult> {
  const user = await requireUser();
  if (!isId(conversationId)) return { ok: false, error: "This conversation isn't available." };

  const conversation = await findConversationForUser(conversationId, user.id);
  if (!conversation) return { ok: false, error: "This conversation isn't available." };

  const other = otherParticipant(conversation, user.id);
  if (!other.active) {
    return { ok: false, error: `${other.name}'s account isn't active right now, so they can't receive messages.` };
  }

  const parsed = messageSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your message and try again." };
  }

  let message;
  try {
    message = await postMessage({ conversationId: conversation.id, senderId: user.id, body: parsed.data.body });
  } catch (err) {
    if (err instanceof MessageRateLimitError) {
      return { ok: false, error: "You're sending messages very quickly. Please wait a minute and try again." };
    }
    throw err;
  }

  // Notify after the response so sending stays snappy.
  after(async () => {
    try {
      await notifyMessageRecipient(message.id);
    } catch (err) {
      console.error("Failed to notify message recipient", err);
    }
  });

  return { ok: true, message: toThreadMessage(message, user.id) };
}

/** Marks the other side's messages in this conversation as read by the signed-in user. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const user = await requireUser();
  if (!isId(conversationId)) return;
  await markRead(conversationId, user.id);
}
