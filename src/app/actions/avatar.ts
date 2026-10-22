"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteUnusedFiles, readUpload, saveUpload } from "@/lib/storage";
import type { FormState } from "@/lib/validation";

/** Sets or replaces the signed-in user's profile photo. */
export async function uploadAvatar(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const upload = await readUpload(formData.get("photo"), "avatar");
  if (!upload.ok) return { fieldErrors: { photo: [upload.error] } };

  await db.$transaction(async (tx) => {
    const fileId = await saveUpload(user.id, upload.file, tx);
    await tx.user.update({ where: { id: user.id }, data: { avatarFileId: fileId } });
    // The previous photo (and any file left behind by an interrupted upload) goes.
    await deleteUnusedFiles(user.id, tx);
  });
  refresh();
  return { ok: true };
}

/** Removes the signed-in user's profile photo. */
export async function removeAvatar(): Promise<FormState> {
  const user = await requireUser();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { avatarFileId: null } });
    await deleteUnusedFiles(user.id, tx);
  });
  refresh();
  return { ok: true };
}
