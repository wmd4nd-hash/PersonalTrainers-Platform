"use server";

import { refresh } from "next/cache";
import { requireTrainerProfileId } from "@/lib/auth";
import { assignProgramToClient, isTrainerClient } from "@/lib/clients";
import { db } from "@/lib/db";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation";
import { assignToClientSchema, clientNoteSchema } from "@/lib/validation/coaching";

/** Private note about one of the trainer's clients. Never shown to the client. */
export async function addClientNote(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();
  if (!(await isTrainerClient(trainerId, clientId))) {
    return { error: "You can only keep notes on your own clients." };
  }
  const parsed = clientNoteSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  await db.clientNote.create({ data: { trainerId, clientId, body: parsed.data.body } });
  refresh();
  return { ok: true };
}

export async function deleteClientNote(noteId: string) {
  const trainerId = await requireTrainerProfileId();
  await db.clientNote.deleteMany({ where: { id: noteId, trainerId } });
  refresh();
}

/** Assigns one of the trainer's programs from the client's page. */
export async function assignProgramFromClientPage(
  clientId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();
  const parsed = assignToClientSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error);

  const result = await assignProgramToClient({
    trainerId,
    clientId,
    programId: parsed.data.programId,
    startsOn: parsed.data.startsOn,
  });
  if ("error" in result) return { error: result.error };
  refresh();
  return { ok: true };
}
