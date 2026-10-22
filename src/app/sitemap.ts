import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { visibleTrainerWhere } from "@/lib/search";
import { appUrl } from "@/lib/stripe";

/** Home, the trainer directory, the quiz and every published trainer. Built per request so it's never stale. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const trainers = await db.trainerProfile.findMany({
    where: visibleTrainerWhere,
    select: { id: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });

  return [
    { url: appUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: appUrl("/trainers"), changeFrequency: "daily", priority: 0.9 },
    { url: appUrl("/match"), changeFrequency: "monthly", priority: 0.6 },
    ...trainers.map((t) => ({
      url: appUrl(`/trainers/${t.id}`),
      lastModified: t.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
