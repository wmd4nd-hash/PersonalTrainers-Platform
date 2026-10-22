import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { Badge, Card, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  findConversationForUser,
  hasUnreadMessages,
  listUpcomingBookings,
  loadThreadPage,
  otherParticipant,
} from "@/lib/messaging";
import { formatSlot } from "@/lib/scheduling";
import { ConversationThread } from "../_components/conversation-thread";

export const metadata: Metadata = { title: "Conversation" };

export default function ConversationPage({ params }: PageProps<"/dashboard/messages/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[36rem]" />}>
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: Pick<PageProps<"/dashboard/messages/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser();
  const conversation = await findConversationForUser(id, user.id);
  if (!conversation) notFound();

  const viewerIsClient = conversation.clientId === user.id;
  const other = otherParticipant(conversation, user.id);
  const firstName = other.name.split(/\s+/)[0] || other.name;
  const now = new Date();
  const [page, unread, bookings] = await Promise.all([
    loadThreadPage(conversation.id, user.id),
    hasUnreadMessages(conversation.id, user.id),
    listUpcomingBookings(conversation, { viewerIsClient, now }),
  ]);
  const profileHref = conversation.trainer.published ? `/trainers/${conversation.trainer.id}` : null;

  return (
    <div className="space-y-4">
      <Link href="/dashboard/messages" className="text-sm text-subtle hover:underline">
        ← Messages
      </Link>

      <header className="flex items-center gap-3">
        <Avatar name={other.name} fileId={other.avatarFileId} size={48} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{other.name}</h1>
          <p className="text-sm text-subtle">
            {viewerIsClient ? "Trainer" : "Client"}
            {viewerIsClient && profileHref && (
              <>
                {" · "}
                <Link href={profileHref} className="font-medium text-brand hover:underline">
                  View profile
                </Link>
              </>
            )}
          </p>
        </div>
      </header>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Upcoming sessions</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-subtle">
            {viewerIsClient ? (
              <>
                Nothing booked with {firstName} yet.{" "}
                {profileHref && (
                  <Link href={profileHref} className="font-medium text-brand">
                    Book a session
                  </Link>
                )}
              </>
            ) : (
              <>No upcoming sessions with {firstName}.</>
            )}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/dashboard/bookings/${b.id}`} className="font-medium hover:underline">
                  {formatSlot(b.startsAt, conversation.trainer.timezone)}
                </Link>
                <span className="text-subtle">{b.format === "ONLINE" ? "Online" : "In person"}</span>
                {b.status === "PENDING_PAYMENT" && (
                  <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Awaiting payment
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConversationThread
        key={conversation.id}
        conversationId={conversation.id}
        initialMessages={page.messages}
        initialHasMore={page.hasMore}
        initialUnread={unread}
        otherName={other.name}
        canSend={other.active}
        emptyHint={
          viewerIsClient
            ? `Say hello to ${firstName}. Ask about goals, availability or anything you'd like to know before booking.`
            : `Start the conversation with ${firstName}.`
        }
        fallbackTimeZone={conversation.trainer.timezone}
        serverNow={now.toISOString()}
      />

      <p className="text-xs text-subtle">
        Keep bookings and payments on the platform so your sessions are covered by cancellation protection and
        refunds.
      </p>
    </div>
  );
}
