import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button, Card, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailMode } from "@/lib/email/transport";
import { firstParam, outboxFilterSchema } from "@/lib/validation/notifications";
import { deliverQueuedNow } from "./actions";
import { EmailStatusBadge, formatUtc } from "./status-badge";

export const metadata: Metadata = { title: "Email outbox" };

const PAGE_SIZE = 25;

export default function OutboxPage({ searchParams }: PageProps<"/admin/outbox">) {
  return (
    <>
      <PageHeader title="Email outbox" description="Every email the platform has sent or is about to send." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Outbox searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Outbox({ searchParams }: Pick<PageProps<"/admin/outbox">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const { status, q, page } = outboxFilterSchema.parse({
    status: firstParam(params.status),
    q: firstParam(params.q),
    page: firstParam(params.page),
  });

  const search: Prisma.EmailOutboxWhereInput = q
    ? { OR: [{ to: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] }
    : {};
  const where: Prisma.EmailOutboxWhereInput = { ...search, ...(status !== "ALL" && { status }) };

  const [total, counts, emails] = await Promise.all([
    db.emailOutbox.count({ where }),
    db.emailOutbox.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
    db.emailOutbox.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, to: true, subject: true, status: true, error: true, createdAt: true, sentAt: true },
    }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const queued = countOf("QUEUED");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => {
    const query = new URLSearchParams();
    if (status !== "ALL") query.set("status", status);
    if (q) query.set("q", q);
    if (n > 1) query.set("page", String(n));
    const qs = query.toString();
    return `/admin/outbox${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <div className="space-y-1">
            <label htmlFor="q" className="block text-sm font-medium">
              Recipient or subject
            </label>
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="e.g. sam@example.com" />
          </div>
          <div className="space-y-1">
            <label htmlFor="status" className="block text-sm font-medium">
              Status
            </label>
            <Select id="status" name="status" defaultValue={status}>
              <option value="ALL">All ({countOf("QUEUED") + countOf("SENT") + countOf("FAILED")})</option>
              <option value="QUEUED">Queued ({queued})</option>
              <option value="SENT">Sent ({countOf("SENT")})</option>
              <option value="FAILED">Failed ({countOf("FAILED")})</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm text-subtle">
          <p>
            {emailMode() === "smtp"
              ? "Delivering over SMTP."
              : "Log mode: SMTP_URL isn't set, so emails are marked sent without leaving the server. Read them here."}
          </p>
          {queued > 0 && (
            <form action={deliverQueuedNow}>
              <SubmitButton variant="secondary" pendingText="Sending…" className="px-3 py-1.5">
                Send {queued} queued now
              </SubmitButton>
            </form>
          )}
        </div>
      </Card>

      {emails.length === 0 ? (
        <Card className="text-center text-sm text-subtle">
          {q || status !== "ALL" ? "No emails match these filters." : "No emails yet. They'll appear here as soon as the platform sends one."}
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {emails.map((email) => (
              <li key={email.id}>
                <Link
                  href={`/admin/outbox/${email.id}`}
                  className="grid gap-1 px-4 py-3 hover:bg-muted sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{email.subject}</span>
                    <span className="block truncate text-xs text-subtle">To {email.to}</span>
                    {email.status === "FAILED" && email.error && (
                      <span className="block truncate text-xs text-red-700 dark:text-red-300">{email.error}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-subtle sm:justify-end">
                    <EmailStatusBadge status={email.status} />
                    <time dateTime={(email.sentAt ?? email.createdAt).toISOString()}>
                      {formatUtc(email.sentAt ?? email.createdAt)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-lg border border-line bg-surface px-3 py-1.5 hover:bg-muted">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-subtle">
            Page {Math.min(page, pages)} of {pages} · {total} emails
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="rounded-lg border border-line bg-surface px-3 py-1.5 hover:bg-muted">
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
