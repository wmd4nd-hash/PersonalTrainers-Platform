"use client";

import { startTransition, useEffect, useEffectEvent, useLayoutEffect, useOptimistic, useRef, useState } from "react";
import { markConversationRead, sendMessage } from "@/app/actions/messages";
import { Button, cx } from "@/components/ui";
import { containsContactDetails } from "@/lib/contact-detection";
import type { ThreadMessage } from "@/lib/messaging";
import { site } from "@/lib/site";
import { dayLabel, groupByDay, timeLabel } from "../_lib/format";
import { MESSAGES_READ_EVENT, useBrowserTimeZone, useVisiblePolling } from "./hooks";
import { MessageComposer } from "./message-composer";

const POLL_INTERVAL_MS = 4000;
/** Within this distance of the bottom, new messages scroll into view by themselves. */
const NEAR_BOTTOM_PX = 120;

type DisplayMessage = ThreadMessage & { sending?: boolean };
type ScrollIntent = { kind: "bottom" } | { kind: "keep"; fromBottom: number };

/** Adds or updates messages by id, keeping time order. Returns `current` when nothing changed. */
function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  let changed = false;
  for (const m of incoming) {
    const existing = byId.get(m.id);
    if (!existing || existing.read !== m.read) {
      byId.set(m.id, m);
      changed = true;
    }
  }
  if (!changed) return current;
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

type ThreadUpdates = { messages: ThreadMessage[]; readUpTo: string | null };
type ThreadPage = { messages: ThreadMessage[]; hasMore: boolean };

export function ConversationThread({
  conversationId,
  initialMessages,
  initialHasMore,
  initialUnread,
  otherName,
  canSend,
  emptyHint,
  fallbackTimeZone,
  serverNow,
}: {
  conversationId: string;
  initialMessages: ThreadMessage[];
  initialHasMore: boolean;
  /** The other side has messages the viewer hasn't read yet. */
  initialUnread: boolean;
  otherName: string;
  /** False when the other account is inactive. */
  canSend: boolean;
  emptyHint: string;
  /** Timezone for the first render, before the browser's own is known. */
  fallbackTimeZone: string;
  /** ISO time of the server render. */
  serverNow: string;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [optimistic, addOptimistic] = useOptimistic<DisplayMessage[], DisplayMessage>(messages, (current, pending) => [
    ...current,
    pending,
  ]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierFailed, setEarlierFailed] = useState(false);
  const [readUpTo, setReadUpTo] = useState<string | null>(null);
  const [showNewBelow, setShowNewBelow] = useState(false);
  const [live, setLive] = useState(true);
  const [now, setNow] = useState(() => new Date(serverNow));
  const timeZone = useBrowserTimeZone(fallbackTimeZone);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const scrollIntent = useRef<ScrollIntent | null>({ kind: "bottom" });
  const unreadPending = useRef(initialUnread);
  const sendCount = useRef(0);

  /** Marks incoming messages read, but only while the viewer can actually see them. */
  function markReadIfVisible() {
    if (!unreadPending.current || document.visibilityState !== "visible") return;
    unreadPending.current = false;
    startTransition(async () => {
      try {
        await markConversationRead(conversationId);
        window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
      } catch {
        unreadPending.current = true;
      }
    });
  }

  const onShown = useEffectEvent(markReadIfVisible);
  useEffect(() => {
    onShown();
    const onVisibilityChange = () => onShown();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Keep "Today" and "Yesterday" right if the page stays open past midnight.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useVisiblePolling(
    async () => {
      const since = messages.at(-1)?.createdAt ?? serverNow;
      const res = await fetch(`/api/messages/${conversationId}?since=${encodeURIComponent(since)}`, {
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 404) {
        setLive(false);
        return;
      }
      if (!res.ok) return;
      const data: ThreadUpdates = await res.json();

      const known = new Set(messages.map((m) => m.id));
      const fresh = data.messages.filter((m) => !known.has(m.id));
      if (fresh.length > 0) {
        if (nearBottom.current) scrollIntent.current = { kind: "bottom" };
        else if (fresh.some((m) => !m.mine)) setShowNewBelow(true);
      }
      setMessages((current) => mergeMessages(current, data.messages));
      setReadUpTo(data.readUpTo);
      if (fresh.some((m) => !m.mine)) {
        unreadPending.current = true;
        markReadIfVisible();
      }
    },
    POLL_INTERVAL_MS,
    live,
  );

  // Scroll after the DOM updates: to the bottom for new messages, or hold the
  // position steady when older ones are added above.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const intent = scrollIntent.current;
    scrollIntent.current = null;
    if (!el) return;
    if (intent?.kind === "keep") el.scrollTop = el.scrollHeight - intent.fromBottom;
    else if (intent?.kind === "bottom" || nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [optimistic, timeZone]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom.current && showNewBelow) setShowNewBelow(false);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowNewBelow(false);
  }

  async function loadEarlier() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingEarlier(true);
    setEarlierFailed(false);
    try {
      const res = await fetch(`/api/messages/${conversationId}?before=${encodeURIComponent(oldest.id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ThreadPage = await res.json();
      const el = scrollRef.current;
      scrollIntent.current = { kind: "keep", fromBottom: el ? el.scrollHeight - el.scrollTop : 0 };
      setMessages((current) => mergeMessages(current, data.messages));
      setHasMore(data.hasMore);
    } catch {
      setEarlierFailed(true);
    } finally {
      setLoadingEarlier(false);
    }
  }

  /** Called inside the composer's transition, so the optimistic message shows until the real one lands. */
  async function send(body: string): Promise<string | null> {
    scrollIntent.current = { kind: "bottom" };
    sendCount.current += 1;
    addOptimistic({
      id: `sending-${sendCount.current}`,
      body: body.trim(),
      createdAt: new Date().toISOString(),
      mine: true,
      flagged: containsContactDetails(body),
      read: false,
      sending: true,
    });
    const formData = new FormData();
    formData.set("body", body);
    let result;
    try {
      result = await sendMessage(conversationId, formData);
    } catch {
      return "Couldn't send your message. Check your connection and try again.";
    }
    // No result means the action redirected, e.g. to log in again.
    if (!result) return null;
    if (!result.ok) return result.error;
    startTransition(() => {
      scrollIntent.current = { kind: "bottom" };
      setMessages((current) => mergeMessages(current, [result.message]));
    });
    return null;
  }

  const groups = groupByDay(optimistic, timeZone);
  const last = optimistic.at(-1);
  const lastSeen = last?.mine && !last.sending && (last.read || (readUpTo !== null && last.createdAt <= readUpTo));

  return (
    <section
      aria-label={`Conversation with ${otherName}`}
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface"
    >
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-[58dvh] min-h-72 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-5"
        >
          {hasMore && (
            <div className="pt-4 text-center">
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1 text-xs"
                onClick={loadEarlier}
                disabled={loadingEarlier}
              >
                {loadingEarlier ? "Loading…" : "Load earlier messages"}
              </Button>
              {earlierFailed && (
                <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
                  Couldn&apos;t load earlier messages. Try again.
                </p>
              )}
            </div>
          )}

          {optimistic.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
              <p className="font-medium">No messages yet</p>
              <p className="max-w-sm text-sm text-subtle">{emptyHint}</p>
            </div>
          ) : (
            <div role="log" aria-label={`Messages with ${otherName}`}>
              {groups.map((group) => (
                <section key={group.key} aria-label={dayLabel(group.date, now, timeZone)}>
                  <h3 className="sticky top-0 z-10 flex justify-center pt-4 pb-2">
                    <span className="rounded-full border border-line bg-surface px-3 py-0.5 text-xs font-medium text-subtle">
                      {dayLabel(group.date, now, timeZone)}
                    </span>
                  </h3>
                  <ol className="space-y-3">
                    {group.items.map((message) => (
                      <MessageItem
                        key={message.id}
                        message={message}
                        otherName={otherName}
                        timeZone={timeZone}
                        seen={message === last && Boolean(lastSeen)}
                      />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </div>

        {showNewBelow && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-medium text-white shadow-md hover:bg-brand-dark"
          >
            New messages ↓
          </button>
        )}
      </div>

      {!live && (
        <p role="status" className="border-t border-line px-4 py-2 text-xs text-subtle">
          Live updates have stopped. Refresh the page to see new messages.
        </p>
      )}

      {canSend ? (
        <MessageComposer recipientName={otherName} onSend={send} />
      ) : (
        <p className="border-t border-line p-4 text-sm text-subtle">
          {otherName}&apos;s account isn&apos;t active right now, so you can&apos;t send new messages.
        </p>
      )}
    </section>
  );
}

function MessageItem({
  message,
  otherName,
  timeZone,
  seen,
}: {
  message: DisplayMessage;
  otherName: string;
  timeZone: string;
  seen: boolean;
}) {
  const { mine } = message;
  return (
    <li className={cx("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cx(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere] sm:max-w-[70%]",
          mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-muted",
          message.sending && "opacity-70",
        )}
      >
        <span className="sr-only">{mine ? "You" : otherName}: </span>
        {message.body}
      </div>
      <p className="mt-1 px-1 text-[11px] text-subtle">
        {message.sending ? (
          "Sending…"
        ) : (
          <>
            <time dateTime={message.createdAt}>{timeLabel(new Date(message.createdAt), timeZone)}</time>
            {seen && " · Seen"}
          </>
        )}
      </p>
      {message.flagged && (mine ? <SenderNotice /> : <RecipientNotice />)}
    </li>
  );
}

/** Shown to the sender of a message that seems to share contact or payment details. */
function SenderNotice() {
  return (
    <div
      role="note"
      className="mt-2 max-w-[85%] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:max-w-[70%] dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="font-medium">Keep bookings and payments on {site.shortName}</p>
      <p className="mt-0.5">
        Your message was sent. Just so you know, sessions booked or paid for outside {site.shortName} aren&apos;t
        covered by our cancellation protection or refunds.
      </p>
    </div>
  );
}

/** A quieter reminder for the person who received such a message. */
function RecipientNotice() {
  return (
    <p className="mt-1 max-w-[85%] px-1 text-[11px] text-subtle sm:max-w-[70%]">
      This message seems to include contact details. Bookings and payments made outside {site.shortName}{" "}
      aren&apos;t covered by cancellation protection or refunds.
    </p>
  );
}
