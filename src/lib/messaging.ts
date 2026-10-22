import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { BookingStatus } from "@/generated/prisma/client";
import { containsContactDetails } from "./contact-detection";
import { db } from "./db";
import { messageSent } from "./events";

/**
 * Data access for client-trainer conversations. Every function that takes a
 * `userId` scopes its reads and writes to conversations that user is part of.
 */

type Tx = Prisma.TransactionClient;

/** Messages loaded per page of a thread. */
export const MESSAGE_PAGE_SIZE = 50;
/** Each user may send this many messages per rolling minute. */
export const MESSAGE_RATE_LIMIT = { max: 20, windowMs: 60_000 };
/** A recipient is notified about a conversation at most once in this window. */
export const NOTIFY_COOLDOWN_MS = 10 * 60_000;
/**
 * New messages are fetched from slightly before the newest one the client has,
 * so a message committed a moment late (concurrent sends) is never skipped.
 */
const POLL_OVERLAP_MS = 10_000;

export class MessageRateLimitError extends Error {}

export function conversationPath(conversationId: string) {
  return `/dashboard/messages/${conversationId}`;
}

/** Matches conversations the user takes part in, as the client or the trainer. */
export function participantWhere(userId: string): Prisma.ConversationWhereInput {
  return { OR: [{ clientId: userId }, { trainer: { userId } }] };
}

const personSelect = { id: true, name: true, avatarFileId: true, suspendedAt: true } satisfies Prisma.UserSelect;

const conversationInclude = {
  client: { select: personSelect },
  trainer: { select: { id: true, userId: true, timezone: true, published: true, user: { select: personSelect } } },
} satisfies Prisma.ConversationInclude;

type ConversationWithPeople = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

export type Participant = {
  userId: string;
  name: string;
  avatarFileId: string | null;
  role: "TRAINER" | "CLIENT";
  /** False when the account is suspended and can't receive messages. */
  active: boolean;
};

/** The person on the other side of the conversation from `userId`. */
export function otherParticipant(conversation: ConversationWithPeople, userId: string): Participant {
  const viewerIsClient = conversation.clientId === userId;
  const person = viewerIsClient ? conversation.trainer.user : conversation.client;
  return {
    userId: person.id,
    name: person.name,
    avatarFileId: person.avatarFileId,
    role: viewerIsClient ? "TRAINER" : "CLIENT",
    active: !person.suspendedAt,
  };
}

/** The conversation if `userId` takes part in it, otherwise null. */
export function findConversationForUser(conversationId: string, userId: string) {
  return db.conversation.findFirst({
    where: { AND: [{ id: conversationId }, participantWhere(userId)] },
    include: conversationInclude,
  });
}

/** Returns the conversation between a trainer and a client, creating it if needed. */
export async function findOrCreateConversation(trainerId: string, clientId: string) {
  const where = { trainerId_clientId: { trainerId, clientId } };
  try {
    return await db.conversation.upsert({
      where,
      create: { trainerId, clientId },
      update: {},
      select: { id: true },
    });
  } catch (err) {
    // Two requests raced to create it; the other one won.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return db.conversation.findUniqueOrThrow({ where, select: { id: true } });
    }
    throw err;
  }
}

/** Clients a trainer may contact: anyone who has booked or bought a package with them. */
function relationshipWhere(trainerId: string): Prisma.UserWhereInput {
  return {
    role: "CLIENT",
    suspendedAt: null,
    OR: [
      { bookings: { some: { trainerId, status: { not: "PENDING_PAYMENT" } } } },
      { purchases: { some: { trainerId, status: { not: "PENDING_PAYMENT" } } } },
    ],
  };
}

export async function canTrainerMessageClient(trainerId: string, clientId: string) {
  const client = await db.user.findFirst({
    where: { AND: [{ id: clientId }, relationshipWhere(trainerId)] },
    select: { id: true },
  });
  return client !== null;
}

/** The trainer's clients who aren't in their inbox yet, for starting a conversation. */
export function listClientsToMessage(trainerId: string) {
  return db.user.findMany({
    where: {
      AND: [
        relationshipWhere(trainerId),
        { NOT: { conversations: { some: { trainerId, messages: { some: {} } } } } },
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 200,
  });
}

// ---------------------------------------------------------------------------
// Messages

const messageSelect = {
  id: true,
  body: true,
  senderId: true,
  flagged: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

/** A message as the thread UI sees it. Safe to send to the browser. */
export type ThreadMessage = {
  id: string;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Sent by the viewer. */
  mine: boolean;
  /** Looks like it shares contact details. */
  flagged: boolean;
  /** Read by the recipient. */
  read: boolean;
};

export function toThreadMessage(message: MessageRow, viewerId: string): ThreadMessage {
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    mine: message.senderId === viewerId,
    flagged: message.flagged,
    read: message.readAt !== null,
  };
}

const newestFirst = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.MessageOrderByWithRelationInput[];

/**
 * A page of a thread, oldest first. Without `beforeId` it's the latest page;
 * with it, the page of messages just before that message.
 */
export async function loadThreadPage(conversationId: string, viewerId: string, beforeId?: string) {
  if (beforeId) {
    const anchor = await db.message.findFirst({ where: { id: beforeId, conversationId }, select: { id: true } });
    if (!anchor) return { messages: [], hasMore: false };
  }
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: newestFirst,
    take: MESSAGE_PAGE_SIZE + 1,
    ...(beforeId ? { cursor: { id: beforeId }, skip: 1 } : {}),
    select: messageSelect,
  });
  const hasMore = rows.length > MESSAGE_PAGE_SIZE;
  return {
    messages: rows
      .slice(0, MESSAGE_PAGE_SIZE)
      .reverse()
      .map((m) => toThreadMessage(m, viewerId)),
    hasMore,
  };
}

/**
 * Messages from around `since` onwards, oldest first, plus how far the other
 * side has read the viewer's messages. The client de-duplicates by id.
 */
export async function loadThreadUpdates(conversationId: string, viewerId: string, since: Date) {
  const [rows, lastRead] = await Promise.all([
    db.message.findMany({
      where: { conversationId, createdAt: { gte: new Date(since.getTime() - POLL_OVERLAP_MS) } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
      select: messageSelect,
    }),
    db.message.findFirst({
      where: { conversationId, senderId: viewerId, readAt: { not: null } },
      orderBy: newestFirst,
      select: { createdAt: true },
    }),
  ]);
  return {
    messages: rows.map((m) => toThreadMessage(m, viewerId)),
    /** The viewer's messages up to this time have been read. */
    readUpTo: lastRead?.createdAt.toISOString() ?? null,
  };
}

async function advisoryLock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Stores a message from a participant. The caller must have checked that the
 * sender takes part in the conversation. Throws `MessageRateLimitError` when
 * the sender is over the per-minute limit.
 */
export async function postMessage({
  conversationId,
  senderId,
  body,
}: {
  conversationId: string;
  senderId: string;
  body: string;
}) {
  const flagged = containsContactDetails(body);
  return db.$transaction(async (tx) => {
    // One send at a time per user, so the rate limit can't be raced.
    await advisoryLock(tx, `message-send:${senderId}`);
    const now = new Date();
    const recent = await tx.message.count({
      where: { senderId, createdAt: { gt: new Date(now.getTime() - MESSAGE_RATE_LIMIT.windowMs) } },
    });
    if (recent >= MESSAGE_RATE_LIMIT.max) throw new MessageRateLimitError();

    const message = await tx.message.create({
      data: { conversationId, senderId, body, flagged, createdAt: now },
      select: messageSelect,
    });
    // Only move forward, in case a concurrent send from the other side committed first.
    await tx.conversation.updateMany({
      where: { id: conversationId, lastMessageAt: { lt: now } },
      data: { lastMessageAt: now },
    });
    return message;
  });
}

/** Marks the other side's messages as read, and the notifications that pointed at them. */
export async function markConversationRead(conversationId: string, userId: string) {
  const now = new Date();
  const { count } = await db.message.updateMany({
    where: { conversationId, conversation: participantWhere(userId), senderId: { not: userId }, readAt: null },
    data: { readAt: now },
  });
  if (count > 0) {
    await db.notification.updateMany({
      where: { userId, link: conversationPath(conversationId), readAt: null },
      data: { readAt: now },
    });
  }
  return count;
}

export async function hasUnreadMessages(conversationId: string, userId: string) {
  const unread = await db.message.findFirst({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    select: { id: true },
  });
  return unread !== null;
}

/** Messages waiting for the user across all their conversations. */
export function countUnreadMessages(userId: string) {
  return db.message.count({
    where: { readAt: null, senderId: { not: userId }, conversation: participantWhere(userId) },
  });
}

/**
 * Tells the recipient about a new message, unless they were already told about
 * this conversation in the last ten minutes, so a busy chat doesn't flood
 * their inbox.
 */
export async function notifyMessageRecipient(messageId: string) {
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      senderId: true,
      conversation: { select: { clientId: true, trainer: { select: { userId: true } } } },
    },
  });
  if (!message) return;
  const { conversation } = message;
  const recipientId =
    message.senderId === conversation.clientId ? conversation.trainer.userId : conversation.clientId;
  const link = conversationPath(message.conversationId);

  await db.$transaction(
    async (tx) => {
      // Serialise per recipient and conversation so two quick messages can't both notify.
      await advisoryLock(tx, `message-notify:${recipientId}:${message.conversationId}`);
      const recent = await tx.notification.findFirst({
        where: { userId: recipientId, link, createdAt: { gte: new Date(Date.now() - NOTIFY_COOLDOWN_MS) } },
        select: { id: true },
      });
      if (recent) return;
      // Writes on its own connection and commits before this lock is released.
      await messageSent(messageId);
    },
    { timeout: 15_000 },
  );
}

// ---------------------------------------------------------------------------
// Inbox

export type InboxItem = {
  id: string;
  other: Participant;
  lastMessage: { body: string; mine: boolean; createdAt: string };
  unread: number;
  /** Used to show times before the browser's own timezone is known. */
  timeZone: string;
};

export async function listConversations(userId: string): Promise<InboxItem[]> {
  const rows = await db.conversation.findMany({
    where: { AND: [participantWhere(userId), { messages: { some: {} } }] },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      ...conversationInclude,
      messages: { orderBy: newestFirst, take: 1, select: { body: true, senderId: true, createdAt: true } },
      _count: { select: { messages: { where: { readAt: null, senderId: { not: userId } } } } },
    },
  });
  return rows.flatMap((row) => {
    const last = row.messages[0];
    if (!last) return [];
    return [
      {
        id: row.id,
        other: otherParticipant(row, userId),
        lastMessage: { body: last.body, mine: last.senderId === userId, createdAt: last.createdAt.toISOString() },
        unread: row._count.messages,
        timeZone: row.trainer.timezone,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Bookings shown above the thread

export function listUpcomingBookings(
  conversation: { trainerId: string; clientId: string },
  { viewerIsClient, now }: { viewerIsClient: boolean; now: Date },
) {
  // Trainers don't see bookings that are still waiting for the client to pay.
  const statuses: BookingStatus[] = viewerIsClient ? ["CONFIRMED", "PENDING_PAYMENT"] : ["CONFIRMED"];
  return db.booking.findMany({
    where: {
      trainerId: conversation.trainerId,
      clientId: conversation.clientId,
      status: { in: statuses },
      endsAt: { gt: now },
    },
    orderBy: { startsAt: "asc" },
    take: 3,
    select: { id: true, startsAt: true, status: true, format: true },
  });
}
