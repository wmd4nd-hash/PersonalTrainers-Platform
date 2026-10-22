"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleTrainerWhere } from "@/lib/search";

const trainerId = z.string().min(1).max(64);

/** Adds a published trainer to the signed-in client's saved list. Saving twice is harmless. */
export async function saveTrainer(id: string) {
  const client = await requireRole("CLIENT");
  const parsed = trainerId.safeParse(id);
  if (!parsed.success) return;

  const trainer = await db.trainerProfile.findFirst({
    where: { id: parsed.data, ...visibleTrainerWhere },
    select: { id: true },
  });
  if (!trainer) return;

  // ON CONFLICT DO NOTHING, so a double click can't fail on the unique constraint.
  await db.favorite.createMany({
    data: { clientId: client.id, trainerId: trainer.id },
    skipDuplicates: true,
  });
  refresh();
}

/** Removes a trainer from the signed-in client's saved list. */
export async function removeSavedTrainer(id: string) {
  const client = await requireRole("CLIENT");
  const parsed = trainerId.safeParse(id);
  if (!parsed.success) return;

  await db.favorite.deleteMany({ where: { clientId: client.id, trainerId: parsed.data } });
  refresh();
}
