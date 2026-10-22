import type {
  DocumentKind,
  DocumentStatus,
  Prisma,
  PrismaClient,
  VerificationStatus,
} from "@/generated/prisma/client";

/**
 * Trainer verification rules. The status functions are pure so they can be unit
 * tested; `syncVerificationStatus` stores the result inside a transaction.
 */

/** A trainer needs an approved, unexpired document of each of these kinds. */
export const REQUIRED_DOCUMENT_KINDS = ["CERTIFICATION", "INSURANCE"] as const satisfies DocumentKind[];

export const documentKindLabels: Record<DocumentKind, string> = {
  CERTIFICATION: "Certification",
  INSURANCE: "Insurance",
  IDENTITY: "Identity",
  OTHER: "Other",
};

export const documentStatusLabels: Record<DocumentStatus, string> = {
  PENDING: "Waiting for review",
  APPROVED: "Approved",
  REJECTED: "Not accepted",
};

export const verificationStatusLabels: Record<VerificationStatus, string> = {
  UNVERIFIED: "Not verified",
  PENDING: "In review",
  VERIFIED: "Verified",
  REJECTED: "Needs attention",
};

export type DocumentForStatus = {
  kind: DocumentKind;
  status: DocumentStatus;
  expiresOn: Date | null;
  reviewedAt: Date | null;
};

/** Calendar day in UTC, e.g. "2026-10-22". Expiry dates are stored as UTC midnight. */
function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** A document stays valid through the expiry day printed on it. */
export function isDocumentExpired(expiresOn: Date | null, now: Date): boolean {
  return expiresOn !== null && utcDay(expiresOn) < utcDay(now);
}

function isValidApproval(doc: DocumentForStatus, kind: DocumentKind, now: Date) {
  return doc.kind === kind && doc.status === "APPROVED" && !isDocumentExpired(doc.expiresOn, now);
}

export type RequirementState = "approved" | "pending" | "expired" | "missing";

/** Where a trainer stands on one required document kind, for their checklist. */
export function requirementState(docs: DocumentForStatus[], kind: DocumentKind, now: Date): RequirementState {
  const ofKind = docs.filter((d) => d.kind === kind);
  if (ofKind.some((d) => isValidApproval(d, kind, now))) return "approved";
  if (ofKind.some((d) => d.status === "PENDING")) return "pending";
  if (ofKind.some((d) => d.status === "APPROVED")) return "expired";
  return "missing";
}

/**
 * VERIFIED needs an approved, unexpired certification and insurance. Otherwise
 * PENDING while anything waits for review, REJECTED if the most recent decision
 * was a rejection, else UNVERIFIED.
 */
export function verificationStatusFor(docs: DocumentForStatus[], now: Date): VerificationStatus {
  const verified = REQUIRED_DOCUMENT_KINDS.every((kind) => docs.some((d) => isValidApproval(d, kind, now)));
  if (verified) return "VERIFIED";
  if (docs.some((d) => d.status === "PENDING")) return "PENDING";

  let latest: DocumentForStatus | undefined;
  for (const doc of docs) {
    if (doc.status === "PENDING" || !doc.reviewedAt) continue;
    if (!latest || doc.reviewedAt > latest.reviewedAt!) latest = doc;
  }
  return latest?.status === "REJECTED" ? "REJECTED" : "UNVERIFIED";
}

export type VerificationState = { status: VerificationStatus; verifiedAt: Date | null };

/** The status to store next. `verifiedAt` is set on becoming verified and cleared on losing it. */
export function nextVerificationState(
  current: VerificationState,
  docs: DocumentForStatus[],
  now: Date,
): VerificationState {
  const status = verificationStatusFor(docs, now);
  if (status !== "VERIFIED") return { status, verifiedAt: null };
  const stillVerified = current.status === "VERIFIED" && current.verifiedAt !== null;
  return { status, verifiedAt: stillVerified ? current.verifiedAt : now };
}

type Tx = Prisma.TransactionClient;

/**
 * Locks a trainer's profile row until the transaction ends, so concurrent
 * changes to the same trainer's documents are applied one after another.
 */
export async function lockTrainerProfile(tx: Tx, trainerId: string) {
  await tx.$queryRaw`SELECT id FROM "TrainerProfile" WHERE id = ${trainerId} FOR UPDATE`;
}

/**
 * Recomputes a trainer's verification status from their documents and stores it.
 * Call inside a transaction, after changing the trainer's documents.
 */
export async function syncVerificationStatus(tx: Tx, trainerId: string, now = new Date()) {
  await lockTrainerProfile(tx, trainerId);
  const profile = await tx.trainerProfile.findUnique({
    where: { id: trainerId },
    select: { verificationStatus: true, verifiedAt: true },
  });
  if (!profile) return null;
  const docs = await tx.verificationDocument.findMany({
    where: { trainerId },
    select: { kind: true, status: true, expiresOn: true, reviewedAt: true },
  });

  const next = nextVerificationState(
    { status: profile.verificationStatus, verifiedAt: profile.verifiedAt },
    docs,
    now,
  );
  if (next.status !== profile.verificationStatus || next.verifiedAt?.getTime() !== profile.verifiedAt?.getTime()) {
    await tx.trainerProfile.update({
      where: { id: trainerId },
      data: { verificationStatus: next.status, verifiedAt: next.verifiedAt },
    });
  }
  return next;
}

/**
 * Verified trainers with an approved document that has since expired. Statuses
 * are only recomputed when documents change, so these may need their badge taken away.
 */
export async function trainersWithExpiredVerification(client: Tx, now = new Date()) {
  const today = new Date(`${utcDay(now)}T00:00:00.000Z`);
  const rows = await client.trainerProfile.findMany({
    where: { verificationStatus: "VERIFIED", documents: { some: { status: "APPROVED", expiresOn: { lt: today } } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Recomputes the status of every verified trainer whose certification or
 * insurance has expired, so the Verified badge disappears once it lapses.
 * Cheap when there is nothing to do; safe to run as often as you like.
 * Returns how many trainers lost their verification.
 */
export async function expireLapsedVerifications(client: PrismaClient, now = new Date()) {
  let expired = 0;
  for (const trainerId of await trainersWithExpiredVerification(client, now)) {
    const next = await client.$transaction((tx) => syncVerificationStatus(tx, trainerId, now));
    if (next && next.status !== "VERIFIED") expired += 1;
  }
  return expired;
}

/** Formats a stored calendar day (or any instant) as e.g. "Oct 22, 2026", in UTC. */
export function formatDay(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
