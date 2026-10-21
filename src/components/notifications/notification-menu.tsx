"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { markAllNotificationsRead, openNotification } from "@/app/actions/notifications";
import { cx } from "../ui";

export type BellItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  /** Already formatted on the server, e.g. "5 min ago". */
  time: string;
  createdAt: string;
};

export function NotificationMenu({ unread, items }: { unread: number; items: BellItem[] }) {
  const pathname = usePathname();
  // Remember which page the panel was opened on: navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenOn(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenOn(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="relative flex size-9 items-center justify-center rounded-lg hover:bg-muted"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden="true"
            data-testid="notification-count"
            className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Latest notifications"
          className="fixed inset-x-3 top-14 z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread > 0 && (
              <form action={markAllNotificationsRead}>
                <PendingButton className="text-xs font-medium text-brand hover:underline" pendingText="Marking…">
                  Mark all as read
                </PendingButton>
              </form>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-subtle">
              You&apos;re all caught up. Bookings, messages and reviews will show up here.
            </p>
          ) : (
            <ul className="max-h-[min(65vh,28rem)] divide-y divide-line overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <form action={openNotification.bind(null, item.id)}>
                    <PendingButton className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted disabled:opacity-60">
                      <span
                        aria-hidden="true"
                        className={cx("mt-1.5 size-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-brand")}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-sm", !item.read && "font-semibold")}>
                          {!item.read && <span className="sr-only">Unread: </span>}
                          {item.title}
                        </span>
                        {item.body && <span className="mt-0.5 line-clamp-2 block text-xs text-subtle">{item.body}</span>}
                        <time dateTime={item.createdAt} className="mt-1 block text-xs text-subtle">
                          {item.time}
                        </time>
                      </span>
                    </PendingButton>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line px-4 py-2.5 text-center">
            <Link href="/dashboard/notifications" className="text-sm font-medium text-brand hover:underline">
              See all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingButton({
  className,
  pendingText,
  children,
}: {
  className: string;
  pendingText?: string;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
