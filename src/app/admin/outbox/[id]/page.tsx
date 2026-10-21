import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, PageHeader, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { firstParam } from "@/lib/validation/notifications";
import { resendEmail } from "../actions";
import { EmailStatusBadge, formatUtc } from "../status-badge";

export const metadata: Metadata = { title: "Email" };

export default function OutboxEmailPage({ params, searchParams }: PageProps<"/admin/outbox/[id]">) {
  return (
    <>
      <Link href="/admin/outbox" className="mb-4 inline-block text-sm text-brand">
        ← Email outbox
      </Link>
      <Suspense fallback={<Skeleton className="h-[32rem]" />}>
        <OutboxEmail params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OutboxEmail({ params, searchParams }: PageProps<"/admin/outbox/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const resent = firstParam((await searchParams).resent) === "1";
  const email = id.length <= 64 ? await db.emailOutbox.findUnique({ where: { id } }) : null;
  if (!email) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        title={email.subject}
        action={
          <form action={resendEmail.bind(null, email.id)}>
            <SubmitButton variant="secondary" pendingText="Queuing…">
              Resend
            </SubmitButton>
          </form>
        }
      />
      {resent && <Alert tone="success">A copy was queued for sending. This is the new copy.</Alert>}

      <Card>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-subtle">To</dt>
          <dd className="break-all">{email.to}</dd>
          <dt className="text-subtle">Status</dt>
          <dd>
            <EmailStatusBadge status={email.status} />
          </dd>
          <dt className="text-subtle">Queued</dt>
          <dd>{formatUtc(email.createdAt)}</dd>
          {email.sentAt && (
            <>
              <dt className="text-subtle">Sent</dt>
              <dd>{formatUtc(email.sentAt)}</dd>
            </>
          )}
          {email.error && (
            <>
              <dt className="text-subtle">Error</dt>
              <dd className="break-words text-red-700 dark:text-red-300">{email.error}</dd>
            </>
          )}
        </dl>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Plain text</h2>
        <pre data-testid="email-text" className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 font-mono text-xs leading-5">
          {email.text}
        </pre>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">HTML</h2>
        {email.html ? (
          // Sandboxed with no permissions: no scripts, no same-origin access, no navigation of this page.
          <iframe
            title={`HTML version of “${email.subject}”`}
            sandbox=""
            srcDoc={email.html}
            className="h-[36rem] w-full rounded-lg border border-line bg-white"
          />
        ) : (
          <p className="text-sm text-subtle">This email has no HTML version.</p>
        )}
      </Card>
    </div>
  );
}
