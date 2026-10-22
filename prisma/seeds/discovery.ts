import type { SeedContext } from "./context";

/** Demo data for the discovery feature. Must be safe to run more than once. */
export async function seedDiscovery(ctx: SeedContext) {
  const priya = ctx.clients["priya@example.com"];
  const saved = ["sofia@example.com", "maya@example.com"].map((email) => ctx.trainers[email]).filter(Boolean);
  if (!priya || saved.length === 0) return;

  // Priya has saved a couple of trainers, so "Saved trainers" has something to show.
  await ctx.db.favorite.createMany({
    data: saved.map((trainer) => ({ clientId: priya.userId, trainerId: trainer.trainerId })),
    skipDuplicates: true,
  });
}
