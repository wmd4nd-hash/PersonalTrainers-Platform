import { cancellationOutcome } from "@/lib/cancellation";
import { formatMoney } from "@/lib/money";

export type CancelPreviewInput = {
  viewer: "CLIENT" | "TRAINER";
  status: "PENDING_PAYMENT" | "CONFIRMED";
  startsAt: Date;
  now: Date;
  windowHours: number;
  lateFeePercent: number;
  priceCents: number;
  refundedCents: number;
  currency: string;
  paidWithPackage: boolean;
  /** The other person's first name, for the trainer's view. */
  clientName: string;
};

export type CancelPreview = { tone: "neutral" | "warning"; text: string };

/** What happens to the money (or package session) if the viewer cancels right now. */
export function cancelPreview(input: CancelPreviewInput): CancelPreview {
  if (input.status === "PENDING_PAYMENT") {
    return {
      tone: "neutral",
      text:
        input.viewer === "CLIENT"
          ? "You haven't been charged yet, so cancelling is free."
          : `${input.clientName} hasn't paid yet, so nothing needs refunding.`,
    };
  }

  const paidCents = input.paidWithPackage ? 0 : Math.max(0, input.priceCents - input.refundedCents);
  const outcome = cancellationOutcome({
    startsAt: input.startsAt,
    now: input.now,
    cancelledBy: input.viewer,
    windowHours: input.windowHours,
    lateFeePercent: input.lateFeePercent,
    paidCents,
  });
  const money = (cents: number) => formatMoney(cents, input.currency);

  if (input.viewer === "TRAINER") {
    return {
      tone: "neutral",
      text: input.paidWithPackage
        ? `If you cancel, the session goes back to ${input.clientName}'s package.`
        : `If you cancel, ${input.clientName} gets a full refund of ${money(outcome.refundCents)}.`,
    };
  }

  if (input.paidWithPackage) {
    return outcome.restoreCredit
      ? { tone: "neutral", text: "If you cancel now, the session goes back to your package." }
      : {
          tone: "warning",
          text: "This is now a late cancellation: if you cancel, the session won't go back to your package.",
        };
  }

  if (!outcome.late) {
    return { tone: "neutral", text: `If you cancel now, you'll get a full refund of ${money(outcome.refundCents)}.` };
  }
  if (outcome.refundCents === 0) {
    return { tone: "warning", text: "This is now a late cancellation: if you cancel, you won't get a refund." };
  }
  return {
    tone: "warning",
    text: `This is now a late cancellation: if you cancel, you'll get ${money(outcome.refundCents)} back and ${money(outcome.keptCents)} goes to your trainer.`,
  };
}
