import type { SeedContext } from "./context";

const HOUR = 60 * 60 * 1000;

/** Demo data for the messaging feature. Must be safe to run more than once. */
export async function seedMessaging(ctx: SeedContext) {
  const { db } = ctx;
  const maya = ctx.trainers["maya@example.com"];
  const client = ctx.clients["client@example.com"];
  if (!maya || !client) return;

  const conversation = await db.conversation.upsert({
    where: { trainerId_clientId: { trainerId: maya.trainerId, clientId: client.userId } },
    create: { trainerId: maya.trainerId, clientId: client.userId },
    update: {},
    select: { id: true, _count: { select: { messages: true } } },
  });
  if (conversation._count.messages > 0) return;

  const now = Date.now();
  const thread = [
    {
      from: client.userId,
      hoursAgo: 50,
      body: "Hi Maya! I'm getting back into training after having a baby. Do you work with complete beginners?",
    },
    {
      from: maya.userId,
      hoursAgo: 49,
      body: "Hi Sam, congratulations! Yes, absolutely. We'd start with mobility and core work and build up from there. Three short sessions a week works well for most parents.",
    },
    {
      from: client.userId,
      hoursAgo: 26,
      body: "That sounds perfect. Are early mornings possible? Before 8 is easiest for me.",
    },
    {
      from: maya.userId,
      hoursAgo: 1,
      body: "Yes, I have 7:00 slots on weekdays. Book whichever suits you and I'll put a plan together before our first session.",
      unread: true,
    },
  ];

  await db.message.createMany({
    data: thread.map((m) => {
      const createdAt = new Date(now - m.hoursAgo * HOUR);
      return {
        conversationId: conversation.id,
        senderId: m.from,
        body: m.body,
        createdAt,
        readAt: m.unread ? null : new Date(createdAt.getTime() + 10 * 60 * 1000),
      };
    }),
  });
  await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(now - HOUR), createdAt: new Date(now - 50 * HOUR) },
  });
}
