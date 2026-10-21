import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { markAllNotificationsRead, markNotificationRead, openNotification } from "@/app/actions/notifications";
import { timeAgo } from "@/components/notifications/time-ago";
import { SubmitButton } from "@/components/submit-button";
import { Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { firstParam, notificationListSchema } from "@/lib/validation/notifications";

export const metadata: Metadata = { title: "Notifications" };

const PAGE_SIZE = 20;

export default function NotificationsPage({ searchParams }: PageProps<"/dashboard/notifications">) {
  return (
    <>
      <PageHeader title="Notifications" description="Everything that happened on your account." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <NotificationList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NotificationList({ searchParams }: Pick<PageProps<"/dashboard/notifications">, "searchParams">) {
  const user = await requireUser();
  const params = await searchParams;
  const { filter, page } = notificationListSchema.parse({
    filter: firstParam(params.filter),
    page: firstParam(params.page),
  });

  const where = { userId: user.id, ...(filter === "unread" && { readAt: null }) };
  const [total, unread, notifications] = await Promise.all([
    db.notification.count({ where }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();
  const href = (next: { filter?: string; page?: number }) => {
    const query = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== "all") query.set("filter", f);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    const qs = query.toString();
    return `/dashboard/notifications${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter notifications" className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(["all", "unread"] as const).map((f) => (
            <Link
              key={f}
              href={href({ filter: f })}
              aria-current={filter === f ? "page" : undefined}
              className={cx(
                "rounded-md px-3 py-1.5",
                filter === f ? "bg-surface font-medium shadow-sm" : "text-subtle hover:text-foreground",
              )}
            >
              {f === "all" ? "All" : `Unread (${unread})`}
            </Link>
          ))}
        </nav>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <SubmitButton variant="secondary" pendingText="Marking…">
              Mark all as read
            </SubmitButton>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="text-center text-sm text-subtle">
          {page > 1 ? (
            <>
              There&apos;s nothing on this page.{" "}
              <Link href={href({ page: 1 })} className="font-medium text-brand">
                Back to the newest
              </Link>
            </>
          ) : filter === "unread" ? (
            "You're all caught up. There are no unread notifications."
          ) : (
            "No notifications yet. We'll let you know about bookings, messages and reviews here."
          )}
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {notifications.map((n) => {
              const isUnread = n.readAt === null;
              return (
                <li key={n.id} className="flex items-start gap-3 px-4 py-4 sm:px-5">
                  <span
                    aria-hidden="true"
                    className={cx("mt-2 size-2 shrink-0 rounded-full", isUnread ? "bg-brand" : "bg-transparent")}
                  />
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <form action={openNotification.bind(null, n.id)}>
                        <button type="submit" className={cx("text-left text-sm hover:underline", isUnread && "font-semibold")}>
                          {isUnread && <span className="sr-only">Unread: </span>}
                          {n.title}
                        </button>
                      </form>
                    ) : (
                      <p className={cx("text-sm", isUnread && "font-semibold")}>
                        {isUnread && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </p>
                    )}
                    {n.body && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-subtle">{n.body}</p>}
                    <time dateTime={n.createdAt.toISOString()} className="mt-1 block text-xs text-subtle">
                      {timeAgo(n.createdAt, now)}
                    </time>
                  </div>
                  {isUnread && (
                    <form action={markNotificationRead.bind(null, n.id)} className="shrink-0">
                      <SubmitButton variant="ghost" className="px-2 py-1 text-xs" pendingText="…">
                        Mark as read
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="rounded-lg border border-line bg-surface px-3 py-1.5 hover:bg-muted">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-subtle">
            Page {Math.min(page, pages)} of {pages}
          </span>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} className="rounded-lg border border-line bg-surface px-3 py-1.5 hover:bg-muted">
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
