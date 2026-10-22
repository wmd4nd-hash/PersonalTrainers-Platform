import type { SeedContext } from "./context";

/**
 * Demo data for the notifications feature: a welcome notification for every
 * demo account, pointing at Settings. Safe to run more than once.
 */
export async function seedNotifications(ctx: SeedContext) {
  const { db } = ctx;
  const users = [
    ...Object.values(ctx.trainers).map((t) => ({ id: t.userId, role: "TRAINER" as const })),
    ...Object.values(ctx.clients).map((c) => ({ id: c.userId, role: "CLIENT" as const })),
    { id: ctx.adminId, role: "ADMIN" as const },
  ];

  const body = {
    TRAINER: "Sync your sessions to your phone's calendar and choose which emails you get in Settings.",
    CLIENT: "Add your training sessions to your calendar and choose which emails you get in Settings.",
    ADMIN: "Every email the platform sends is listed in the Email outbox.",
  };

  for (const user of users) {
    const existing = await db.notification.findFirst({
      where: { userId: user.id, type: "account.welcome" },
      select: { id: true },
    });
    if (existing) continue;
    await db.notification.create({
      data: {
        userId: user.id,
        type: "account.welcome",
        title: "Welcome to PT Platform",
        body: body[user.role],
        link: user.role === "ADMIN" ? "/admin/outbox" : "/dashboard/settings",
      },
    });
  }
}
