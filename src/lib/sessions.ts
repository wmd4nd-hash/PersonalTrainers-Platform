/** Video link for an online session: the trainer's own link, or a private Jitsi room. */
export function meetingUrlFor(trainer: { meetingUrl: string }, bookingId: string): string {
  const own = trainer.meetingUrl.trim();
  return own || `https://meet.jit.si/ptp-${bookingId}`;
}
