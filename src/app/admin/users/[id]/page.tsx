import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { suspendUser, unsuspendUser } from "@/app/actions/admin";
import { Avatar } from "@/components/avatar";
import { Button, Card, Skeleton } from "@/components/ui";
import { DocumentStatusBadge, VerificationStatusBadge } from "@/components/verified-badge";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { documentKindLabels, formatDay, isDocumentExpired } from "@/lib/verification";
import { AdminBookingList, adminBookingSelect } from "../../bookings/booking-list";
import { RoleBadge, SuspendedBadge } from "../role-badge";

export const metadata: Metadata = { title: "User" };

const RECENT_BOOKINGS = 20;

export default function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  return (
    <>
      <Link href="/admin/users" className="text-sm text-subtle hover:underline">
        ← Users
      </Link>
      <div className="mt-3">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <UserDetail params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function UserDetail({ params }: Pick<PageProps<"/admin/users/[id]">, "params">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatarFileId: true,
      createdAt: true,
      suspendedAt: true,
      trainerProfile: {
        select: {
          id: true,
          headline: true,
          city: true,
          published: true,
          sessionRateCents: true,
          sessionMinutes: true,
          currency: true,
          verificationStatus: true,
          verifiedAt: true,
          documents: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              kind: true,
              status: true,
              expiresOn: true,
              createdAt: true,
              reviewedAt: true,
              reviewerNote: true,
              file: { select: { id: true, filename: true } },
            },
          },
        },
      },
    },
  });
  if (!user) notFound();

  const now = new Date();
  const involving = { OR: [{ clientId: user.id }, { trainer: { userId: user.id } }] };
  const [bookings, bookingCount, upcoming] = await Promise.all([
    db.booking.findMany({
      where: involving,
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      take: RECENT_BOOKINGS,
      select: adminBookingSelect,
    }),
    db.booking.count({ where: involving }),
    db.booking.count({
      where: { ...involving, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] }, startsAt: { gt: now } },
    }),
  ]);
  const trainer = user.trainerProfile;
  const isSelf = user.id === admin.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={user.name} fileId={user.avatarFileId} size={64} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
            <RoleBadge role={user.role} />
            {user.suspendedAt && <SuspendedBadge />}
          </div>
          <p className="break-all text-sm text-subtle">
            {user.email} · joined {formatDay(user.createdAt)}
          </p>
        </div>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 text-sm">
          <h2 className="font-semibold">Account access</h2>
          {user.role === "ADMIN" ? (
            <p className="text-subtle">
              {isSelf ? "This is your account." : "Admin accounts can't be suspended here."}
            </p>
          ) : user.suspendedAt ? (
            <p>Suspended on {formatDay(user.suspendedAt)}. They can&apos;t log in{trainer && " and their profile is hidden"}.</p>
          ) : (
            <p className="text-subtle">
              Suspending signs them out and stops them logging in
              {trainer && ", and hides their profile from clients"}.
              {upcoming > 0 &&
                ` Their ${upcoming === 1 ? "upcoming booking stays" : `${upcoming} upcoming bookings stay`} booked; cancel below if needed.`}
            </p>
          )}
        </div>
        {user.role !== "ADMIN" &&
          (user.suspendedAt ? (
            <form action={unsuspendUser.bind(null, user.id)}>
              <Button variant="secondary">Lift suspension</Button>
            </form>
          ) : (
            <form action={suspendUser.bind(null, user.id)}>
              <Button variant="danger">Suspend account</Button>
            </form>
          ))}
      </Card>

      {trainer && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Trainer profile</h2>
            {trainer.published && !user.suspendedAt && (
              <Link href={`/trainers/${trainer.id}`} className="text-sm font-medium text-brand">
                View public profile
              </Link>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-subtle">Published</dt>
              <dd>{trainer.published ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Verification</dt>
              <dd className="flex flex-wrap items-center gap-1">
                <VerificationStatusBadge status={trainer.verificationStatus} />
                {trainer.verifiedAt && <span className="text-xs text-subtle">since {formatDay(trainer.verifiedAt)}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Price</dt>
              <dd>
                {formatMoney(trainer.sessionRateCents, trainer.currency)} / {trainer.sessionMinutes} min
              </dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">City</dt>
              <dd>{trainer.city || "Online only"}</dd>
            </div>
          </dl>
          {trainer.headline && <p className="text-sm">{trainer.headline}</p>}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Documents</h3>
            {trainer.documents.length === 0 ? (
              <p className="text-sm text-subtle">No documents uploaded.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {trainer.documents.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{documentKindLabels[doc.kind]}</span>{" "}
                      <a
                        href={`/api/files/${doc.file.id}`}
                        target="_blank"
                        rel="noopener"
                        className="break-all text-brand hover:underline"
                      >
                        {doc.file.filename}
                      </a>
                      <p className="text-xs text-subtle">
                        Uploaded {formatDay(doc.createdAt)}
                        {doc.expiresOn &&
                          ` · ${isDocumentExpired(doc.expiresOn, now) ? "Expired" : "Expires"} ${formatDay(doc.expiresOn)}`}
                        {doc.reviewerNote && ` · “${doc.reviewerNote}”`}
                      </p>
                    </div>
                    <DocumentStatusBadge status={doc.status} />
                  </li>
                ))}
              </ul>
            )}
            {trainer.documents.some((d) => d.status === "PENDING") && (
              <Link href="/admin/verification" className="mt-2 inline-block text-sm font-medium text-brand">
                Review in the verification queue
              </Link>
            )}
          </div>
        </Card>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Bookings</h2>
          {bookingCount > RECENT_BOOKINGS && (
            <Link href={`/admin/bookings?q=${encodeURIComponent(user.email)}`} className="text-sm font-medium text-brand">
              See all {bookingCount}
            </Link>
          )}
        </div>
        <AdminBookingList bookings={bookings} now={now} empty="No bookings yet." />
      </section>
    </div>
  );
}
