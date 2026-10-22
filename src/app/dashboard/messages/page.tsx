import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { Alert, Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversationPath, listClientsToMessage, listConversations, type InboxItem } from "@/lib/messaging";
import { InboxTime } from "./_components/inbox-time";
import { StartConversationForm } from "./_components/start-conversation-form";
import { previewText } from "./_lib/format";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage({ searchParams }: PageProps<"/dashboard/messages">) {
  return (
    <>
      <PageHeader title="Messages" description="Conversations with your trainers or clients." />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Inbox({ searchParams }: Pick<PageProps<"/dashboard/messages">, "searchParams">) {
  const user = await requireUser();
  const { unavailable } = await searchParams;
  const now = new Date();

  const trainer =
    user.role === "TRAINER"
      ? await db.trainerProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
      : null;
  const [conversations, clientsToMessage] = await Promise.all([
    listConversations(user.id),
    trainer ? listClientsToMessage(trainer.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      {unavailable && (
        <Alert>You can message clients once they&apos;ve booked a session or bought a package with you.</Alert>
      )}

      {clientsToMessage.length > 0 && (
        <Card className="p-4">
          <StartConversationForm clients={clientsToMessage} />
        </Card>
      )}

      {conversations.length === 0 ? (
        <EmptyInbox user={user} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {conversations.map((item) => (
            <InboxRow key={item.id} item={item} serverNow={now.toISOString()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxRow({ item, serverNow }: { item: InboxItem; serverNow: string }) {
  const unread = item.unread > 0;
  return (
    <li>
      <Link
        href={conversationPath(item.id)}
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted focus-visible:bg-muted"
      >
        <Avatar name={item.other.name} fileId={item.other.avatarFileId} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cx("truncate", unread ? "font-semibold" : "font-medium")}>{item.other.name}</p>
            <InboxTime iso={item.lastMessage.createdAt} serverNow={serverNow} fallbackTimeZone={item.timeZone} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className={cx("truncate text-sm", unread ? "text-foreground" : "text-subtle")}>
              {item.lastMessage.mine && <span className="text-subtle">You: </span>}
              {previewText(item.lastMessage.body)}
            </p>
            {unread && (
              <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">
                {item.unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function EmptyInbox({ user }: { user: CurrentUser }) {
  return (
    <Card className="space-y-1 text-center">
      <p className="font-medium">No conversations yet</p>
      {user.role === "TRAINER" ? (
        <p className="text-sm text-subtle">
          Clients can message you from your profile page. Once someone books a session or buys a package, you can
          message them from here too.
        </p>
      ) : (
        <p className="text-sm text-subtle">
          Have a question before you book?{" "}
          <Link href="/trainers" className="font-medium text-brand">
            Find a trainer
          </Link>{" "}
          and send them a message from their profile.
        </p>
      )}
    </Card>
  );
}
