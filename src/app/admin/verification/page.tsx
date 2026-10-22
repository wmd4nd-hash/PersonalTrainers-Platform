import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { DocumentStatusBadge, VerificationStatusBadge } from "@/components/verified-badge";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentKindLabels, formatDay, isDocumentExpired } from "@/lib/verification";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Verification queue" };

const QUEUE_SIZE = 50;

export default function VerificationQueuePage() {
  return (
    <>
      <PageHeader title="Verification queue" description="Trainer documents waiting for review, oldest first." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Queue />
      </Suspense>
    </>
  );
}

async function Queue() {
  await requireAdmin();
  const [pending, total, recent] = await Promise.all([
    db.verificationDocument.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: QUEUE_SIZE,
      select: {
        id: true,
        kind: true,
        expiresOn: true,
        createdAt: true,
        file: { select: { id: true, filename: true, contentType: true, size: true } },
        trainer: {
          select: {
            id: true,
            verificationStatus: true,
            user: { select: { id: true, name: true, email: true, avatarFileId: true } },
            documents: {
              where: { status: { not: "PENDING" } },
              orderBy: { reviewedAt: "desc" },
              take: 4,
              select: { id: true, kind: true, status: true, expiresOn: true },
            },
          },
        },
      },
    }),
    db.verificationDocument.count({ where: { status: "PENDING" } }),
    db.verificationDocument.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { reviewedAt: "desc" },
      take: 10,
      select: {
        id: true,
        kind: true,
        status: true,
        reviewedAt: true,
        reviewerNote: true,
        reviewedBy: { select: { name: true } },
        trainer: { select: { user: { select: { id: true, name: true } } } },
      },
    }),
  ]);
  const now = new Date();

  return (
    <div className="space-y-8">
      {pending.length === 0 ? (
        <Card className="text-center text-sm text-subtle">
          Nothing to review. New documents will show up here.
        </Card>
      ) : (
        <section className="space-y-3">
          <p className="text-sm text-subtle">
            {total === 1 ? "1 document is" : `${total} documents are`} waiting
            {total > pending.length && `. Showing the ${pending.length} oldest`}.
          </p>
          <ul className="space-y-4">
            {pending.map((doc) => {
              const { trainer } = doc;
              const label = `${documentKindLabels[doc.kind]} from ${trainer.user.name}`;
              const expired = isDocumentExpired(doc.expiresOn, now);
              return (
                <li key={doc.id} aria-label={label}>
                  <Card className="grid gap-5 lg:grid-cols-[1fr_320px]">
                    <div className="min-w-0 space-y-3">
                      <div className="flex items-start gap-3">
                        <Avatar name={trainer.user.name} fileId={trainer.user.avatarFileId} size={40} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/admin/users/${trainer.user.id}`} className="font-medium hover:underline">
                              {trainer.user.name}
                            </Link>
                            <VerificationStatusBadge status={trainer.verificationStatus} />
                          </div>
                          <p className="truncate text-sm text-subtle">{trainer.user.email}</p>
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-xs text-subtle">Type</dt>
                          <dd className="font-medium">{documentKindLabels[doc.kind]}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-subtle">Uploaded</dt>
                          <dd>{formatDay(doc.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-subtle">Expires</dt>
                          <dd className={expired ? "font-medium text-red-700 dark:text-red-300" : undefined}>
                            {doc.expiresOn ? `${formatDay(doc.expiresOn)}${expired ? " (expired)" : ""}` : "Not given"}
                          </dd>
                        </div>
                      </dl>
                      <a
                        href={`/api/files/${doc.file.id}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-muted"
                      >
                        <span aria-hidden>📄</span>
                        <span className="truncate">Open {doc.file.filename}</span>
                        <span className="shrink-0 text-xs font-normal text-subtle">
                          {doc.file.contentType === "application/pdf" ? "PDF" : "Image"} · {Math.max(1, Math.round(doc.file.size / 1024))} KB
                        </span>
                      </a>
                      {trainer.documents.length > 0 && (
                        <div className="text-sm">
                          <p className="mb-1 text-xs text-subtle">Already reviewed for this trainer</p>
                          <ul className="flex flex-wrap gap-2">
                            {trainer.documents.map((d) => (
                              <li key={d.id} className="flex items-center gap-1">
                                {documentKindLabels[d.kind]} <DocumentStatusBadge status={d.status} />
                                {isDocumentExpired(d.expiresOn, now) && <span className="text-xs text-subtle">(expired)</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <ReviewForm documentId={doc.id} label={label} />
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Recently reviewed</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-subtle">No decisions yet.</p>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {recent.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/users/${doc.trainer.user.id}`} className="font-medium hover:underline">
                    {doc.trainer.user.name}
                  </Link>{" "}
                  · {documentKindLabels[doc.kind]}
                  {doc.reviewerNote && <p className="truncate text-xs text-subtle">“{doc.reviewerNote}”</p>}
                </div>
                <div className="flex items-center gap-2 text-xs text-subtle">
                  <DocumentStatusBadge status={doc.status} />
                  {doc.reviewedAt && formatDay(doc.reviewedAt)}
                  {doc.reviewedBy && ` by ${doc.reviewedBy.name}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
