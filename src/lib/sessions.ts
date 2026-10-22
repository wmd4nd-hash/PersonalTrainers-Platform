/** Video link for an online session: the trainer's own link, or a private Jitsi room. */
export function meetingUrlFor(trainer: { meetingUrl: string }, bookingId: string): string {
  const own = trainer.meetingUrl.trim();
  return own || `https://meet.jit.si/ptp-${bookingId}`;
}

export type SessionPhase = "upcoming" | "starting-soon" | "in-progress" | "ended";

/** Minutes before the start when we nudge people to join. */
export const JOIN_EARLY_MINUTES = 15;

/** Where a session is in time, for labels like "Starting soon". */
export function sessionPhase(session: { startsAt: Date; endsAt: Date }, now: Date): SessionPhase {
  const t = now.getTime();
  if (t >= session.endsAt.getTime()) return "ended";
  if (t >= session.startsAt.getTime()) return "in-progress";
  if (t >= session.startsAt.getTime() - JOIN_EARLY_MINUTES * 60_000) return "starting-soon";
  return "upcoming";
}

/** The video link to show, or null when there's nothing to join. */
export function joinUrl(
  session: { format: string; status: string; meetingUrl: string | null; startsAt: Date; endsAt: Date },
  now: Date,
): string | null {
  if (session.format !== "ONLINE" || session.status !== "CONFIRMED" || !session.meetingUrl) return null;
  return sessionPhase(session, now) === "ended" ? null : session.meetingUrl;
}
