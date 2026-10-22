export type CancelledBy = "CLIENT" | "TRAINER" | "ADMIN";

export type CancellationInput = {
  startsAt: Date;
  now: Date;
  cancelledBy: CancelledBy;
  /** Full refund when the client cancels at least this many hours ahead. */
  windowHours: number;
  /** Share of the price kept when the client cancels late (0-100). */
  lateFeePercent: number;
  /** Amount actually paid for this booking (0 for package sessions). */
  paidCents: number;
  /** The trainer moved this session, so the client can cancel free of charge. */
  waiveLateFee?: boolean;
};

export type CancellationOutcome = {
  late: boolean;
  refundCents: number;
  keptCents: number;
  /** For package sessions: whether the session credit goes back to the client. */
  restoreCredit: boolean;
};

export function cancellationOutcome(input: CancellationInput): CancellationOutcome {
  const hoursAhead = (input.startsAt.getTime() - input.now.getTime()) / 3_600_000;
  // Trainers and admins cancelling never penalise the client.
  const late = input.cancelledBy === "CLIENT" && !input.waiveLateFee && hoursAhead < input.windowHours;
  const feePercent = late ? Math.min(100, Math.max(0, input.lateFeePercent)) : 0;
  const paidCents = Math.max(0, Math.round(input.paidCents));
  const keptCents = Math.round((paidCents * feePercent) / 100);
  return {
    late,
    refundCents: paidCents - keptCents,
    keptCents,
    restoreCredit: !late || feePercent === 0,
  };
}

export function describePolicy(windowHours: number, lateFeePercent: number): string {
  if (lateFeePercent === 0) return "Free cancellation at any time.";
  const fee = lateFeePercent === 100 ? "the full price is charged" : `${lateFeePercent}% of the price is charged`;
  return `Free cancellation up to ${windowHours} hours before the session. After that, ${fee}.`;
}
