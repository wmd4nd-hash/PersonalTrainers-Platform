"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { cancelBookingAs } from "@/lib/booking-lifecycle";
import { db } from "@/lib/db";
import { DEMO_ACCOUNT_EMAILS, isDemoMode } from "@/lib/demo";
import { documentReviewed } from "@/lib/events";
import { deleteUnusedFiles } from "@/lib/storage";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";
import { adminCancelSchema, documentReviewSchema } from "@/lib/validation/trust";
import { lockTrainerProfile, syncVerificationStatus } from "@/lib/verification";

/** Approves or rejects a pending verification document and updates the trainer's status. */
export async function reviewDocument(documentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = documentReviewSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { decision, note } = parsed.data;

  const document = await db.verificationDocument.findUnique({
    where: { id: documentId },
    select: { trainerId: true },
  });
  if (!document) return { error: "This document no longer exists. The trainer may have deleted it." };

  const now = new Date();
  const reviewed = await db.$transaction(async (tx) => {
    await lockTrainerProfile(tx, document.trainerId);
    // Only pending documents can be reviewed, so a double submit can't overwrite a decision.
    const { count } = await tx.verificationDocument.updateMany({
      where: { id: documentId, status: "PENDING" },
      data: { status: decision, reviewerNote: note, reviewedById: admin.id, reviewedAt: now },
    });
    if (count === 0) return false;
    await syncVerificationStatus(tx, document.trainerId, now);
    return true;
  });
  if (!reviewed) return { error: "This document was already reviewed, or the trainer deleted it." };

  await documentReviewed(documentId);
  refresh();
  return { ok: true };
}

/** Blocks a client or trainer from signing in. Admin accounts can't be suspended here. */
export async function suspendUser(userId: string) {
  const admin = await requireAdmin();
  await db.user.updateMany({
    where: {
      id: userId,
      NOT: { id: admin.id },
      role: { not: "ADMIN" },
      suspendedAt: null,
      // On the public demo, the shared demo accounts stay usable for everyone.
      ...(isDemoMode() && { email: { notIn: [...DEMO_ACCOUNT_EMAILS] } }),
    },
    data: { suspendedAt: new Date(), sessionVersion: { increment: 1 } },
  });
  refresh();
}

export async function unsuspendUser(userId: string) {
  await requireAdmin();
  await db.user.updateMany({
    where: { id: userId, role: { not: "ADMIN" } },
    data: { suspendedAt: null },
  });
  refresh();
}

/** Takes down someone's profile photo, e.g. when it isn't appropriate. They can upload a new one. */
export async function removeUserPhoto(userId: string) {
  await requireAdmin();
  await db.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { id: userId }, data: { avatarFileId: null } });
    await deleteUnusedFiles(userId, tx);
  });
  refresh();
}

/** Cancels a booking as an admin: the client always gets a full refund. */
export async function adminCancelBooking(bookingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = adminCancelSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  const cancelled = await cancelBookingAs({ id: admin.id, role: "ADMIN" }, bookingId, parsed.data.reason);
  if (!cancelled) {
    return { error: "This booking can't be cancelled. It may have started already or been cancelled." };
  }
  refresh();
  return { ok: true };
}
