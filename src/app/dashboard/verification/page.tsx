import type { Metadata } from "next";
import { after } from "next/server";
import { Suspense } from "react";
import { deleteDocument } from "@/app/actions/verification";
import { SubmitButton } from "@/components/submit-button";
import { Card, PageHeader, Skeleton, cx } from "@/components/ui";
import {
  DocumentStatusBadge,
  VerificationStatusBadge,
  verifiedExplanation,
} from "@/components/verified-badge";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  REQUIRED_DOCUMENT_KINDS,
  documentKindLabels,
  formatDay,
  isDocumentExpired,
  nextVerificationState,
  requirementState,
  syncVerificationStatus,
  type RequirementState,
} from "@/lib/verification";
import type { VerificationStatus } from "@/generated/prisma/client";
import { UploadDocumentForm } from "./upload-form";

export const metadata: Metadata = { title: "Verification" };

export default function VerificationPage() {
  return (
    <>
      <PageHeader
        title="Verification"
        description="Send us your certification and insurance to get a Verified badge on your profile."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Verification />
      </Suspense>
    </>
  );
}

const statusIntro: Record<VerificationStatus, string> = {
  UNVERIFIED: "Upload your certification and insurance below. Once our team has checked both, clients see a Verified badge on your profile.",
  PENDING: "Thanks! Our team is reviewing your documents. We'll send you a notification when it's done.",
  VERIFIED: "Clients see a Verified badge on your profile.",
  REJECTED: "We couldn't accept one of your documents. Read the note below, then upload a new one.",
};

const requirementText: Record<RequirementState, string> = {
  approved: "Approved",
  pending: "Waiting for review",
  expired: "Expired. Upload a current one",
  missing: "Needed",
};

async function Verification() {
  const trainerId = await requireTrainerProfileId();
  const [profile, documents] = await Promise.all([
    db.trainerProfile.findUniqueOrThrow({
      where: { id: trainerId },
      select: { verificationStatus: true, verifiedAt: true },
    }),
    db.verificationDocument.findMany({
      where: { trainerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        status: true,
        expiresOn: true,
        reviewedAt: true,
        reviewerNote: true,
        createdAt: true,
        file: { select: { id: true, filename: true } },
      },
    }),
  ]);
  const now = new Date();
  // The stored status only changes when documents do, so it can lag behind an expiry date.
  // Show the up-to-date one and save it after the response.
  const status = nextVerificationState(
    { status: profile.verificationStatus, verifiedAt: profile.verifiedAt },
    documents,
    now,
  );
  if (status.status !== profile.verificationStatus) {
    after(() => db.$transaction((tx) => syncVerificationStatus(tx, trainerId)));
  }
  const requirements = REQUIRED_DOCUMENT_KINDS.map((kind) => ({
    kind,
    state: requirementState(documents, kind, now),
  }));
  const nextNeeded = requirements.find((r) => r.state === "missing" || r.state === "expired")?.kind;

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Your status</h2>
          <VerificationStatusBadge status={status.status} />
        </div>
        <p className="text-sm">
          {statusIntro[status.status]}
          {status.status === "VERIFIED" && ` ${verifiedExplanation(status.verifiedAt)}.`}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {requirements.map(({ kind, state }) => (
            <li key={kind} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span
                aria-hidden
                className={cx(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  state === "approved"
                    ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                    : "bg-muted text-subtle",
                )}
              >
                {state === "approved" ? "✓" : state === "pending" ? "…" : "!"}
              </span>
              <span>
                <span className="font-medium">{documentKindLabels[kind]}</span>
                <span className="block text-xs text-subtle">{requirementText[state]}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">Upload a document</h2>
        <p className="mb-4 text-sm text-subtle">
          Only our team can see your documents. They are never shown to clients.
        </p>
        <UploadDocumentForm suggestedKind={nextNeeded ?? "CERTIFICATION"} />
      </Card>

      <section>
        <h2 className="mb-3 font-semibold">Your documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-subtle">You haven&apos;t uploaded anything yet.</p>
        ) : (
          <ul className="space-y-3">
            {documents.map((doc) => {
              const expired = isDocumentExpired(doc.expiresOn, now);
              return (
                <li key={doc.id}>
                  <Card className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{documentKindLabels[doc.kind]}</span>
                        <DocumentStatusBadge status={doc.status} />
                      </div>
                      <a
                        href={`/api/files/${doc.file.id}`}
                        target="_blank"
                        rel="noopener"
                        className="block truncate text-sm text-brand hover:underline"
                      >
                        {doc.file.filename}
                      </a>
                      <p className="text-xs text-subtle">
                        Uploaded {formatDay(doc.createdAt)}
                        {doc.expiresOn && (
                          <>
                            {" · "}
                            <span className={cx(expired && "font-medium text-red-700 dark:text-red-300")}>
                              {expired ? "Expired" : "Expires"} {formatDay(doc.expiresOn)}
                            </span>
                          </>
                        )}
                        {doc.reviewedAt && ` · Reviewed ${formatDay(doc.reviewedAt)}`}
                      </p>
                      {doc.reviewerNote && (
                        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                          <span className="font-medium">Note from our team:</span> {doc.reviewerNote}
                        </p>
                      )}
                    </div>
                    {doc.status === "PENDING" && (
                      <form action={deleteDocument.bind(null, doc.id)}>
                        <SubmitButton
                          variant="ghost"
                          pendingText="Deleting…"
                          aria-label={`Delete ${doc.file.filename}`}
                        >
                          Delete
                        </SubmitButton>
                      </form>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
