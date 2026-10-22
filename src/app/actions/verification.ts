"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { readUpload, saveUpload } from "@/lib/storage";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";
import { documentUploadSchema } from "@/lib/validation/trust";
import { isDocumentExpired, lockTrainerProfile, syncVerificationStatus } from "@/lib/verification";

/** Documents a trainer can have waiting for review at once. */
const MAX_PENDING_DOCUMENTS = 10;

/** The signed-in trainer's user id and profile id. */
async function currentTrainer() {
  const user = await requireRole("TRAINER");
  const profile = await db.trainerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!profile) redirect("/dashboard");
  return { userId: user.id, trainerId: profile.id };
}

export async function uploadDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const { userId, trainerId } = await currentTrainer();
  const parsed = documentUploadSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { kind, expiresOn } = parsed.data;

  const now = new Date();
  if (expiresOn && isDocumentExpired(expiresOn, now)) {
    return { fieldErrors: { expiresOn: ["This date has passed. Upload a document that is still valid."] } };
  }
  const upload = await readUpload(formData.get("file"), "document");
  if (!upload.ok) return { fieldErrors: { file: [upload.error] } };

  const saved = await db.$transaction(async (tx) => {
    await lockTrainerProfile(tx, trainerId);
    const pending = await tx.verificationDocument.count({ where: { trainerId, status: "PENDING" } });
    if (pending >= MAX_PENDING_DOCUMENTS) return false;

    const fileId = await saveUpload(userId, upload.file, tx);
    await tx.verificationDocument.create({ data: { trainerId, kind, expiresOn, fileId } });
    // Moves an unverified trainer to PENDING; a verified trainer stays verified.
    await syncVerificationStatus(tx, trainerId, now);
    return true;
  });
  if (!saved) {
    return { error: "You already have several documents waiting for review. Please wait for those first." };
  }
  refresh();
  return { ok: true };
}

/** Deletes one of the trainer's documents that hasn't been reviewed yet. */
export async function deleteDocument(documentId: string) {
  const { trainerId } = await currentTrainer();
  await db.$transaction(async (tx) => {
    await lockTrainerProfile(tx, trainerId);
    // Deleting the file removes its document too.
    const { count } = await tx.storedFile.deleteMany({
      where: { document: { id: documentId, trainerId, status: "PENDING" } },
    });
    if (count > 0) await syncVerificationStatus(tx, trainerId);
  });
  refresh();
}
