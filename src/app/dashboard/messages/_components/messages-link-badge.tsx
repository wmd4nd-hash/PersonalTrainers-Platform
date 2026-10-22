"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MESSAGES_READ_EVENT, useVisiblePolling } from "./hooks";

const POLL_INTERVAL_MS = 30_000;

async function fetchUnread(): Promise<number | null> {
  const res = await fetch("/api/messages", { cache: "no-store" });
  if (!res.ok) return null;
  const data: { unread: number } = await res.json();
  return data.unread;
}

/** Header link to the inbox. The unread count stays fresh while the tab is open. */
export function MessagesLinkBadge({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  // A fresh server render (after a navigation or refresh) brings a newer count.
  const [serverCount, setServerCount] = useState(initialUnread);
  if (serverCount !== initialUnread) {
    setServerCount(initialUnread);
    setUnread(initialUnread);
  }

  async function refresh() {
    const count = await fetchUnread();
    if (count !== null) setUnread(count);
  }

  useVisiblePolling(refresh, POLL_INTERVAL_MS);

  useEffect(() => {
    function onRead() {
      fetchUnread()
        .then((count) => count !== null && setUnread(count))
        .catch(() => {});
    }
    window.addEventListener(MESSAGES_READ_EVENT, onRead);
    return () => window.removeEventListener(MESSAGES_READ_EVENT, onRead);
  }, []);

  const label = unread > 0 ? `Messages, ${unread} unread` : "Messages";
  return (
    <Link
      href="/dashboard/messages"
      aria-label={label}
      title={label}
      className="relative inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted"
    >
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4.2 3.6a.5.5 0 0 1-.8-.4V5.5Z"
        />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-semibold leading-4 text-white"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
