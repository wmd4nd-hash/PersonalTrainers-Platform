import type { DocumentStatus, VerificationStatus } from "@/generated/prisma/client";
import { documentStatusLabels, formatDay, verificationStatusLabels } from "@/lib/verification";
import { Badge } from "./ui";

/** What the badge promises, word for word. */
export function verifiedExplanation(verifiedAt?: Date | null) {
  return verifiedAt
    ? `Certification and insurance checked by our team on ${formatDay(verifiedAt)}`
    : "Certification and insurance checked by our team";
}

/**
 * Shown next to trainers whose documents an admin has checked. The explanation
 * shows on hover (title), and on tap or keyboard focus, where a title can't be seen.
 */
export function VerifiedBadge({ status, verifiedAt }: { status: VerificationStatus; verifiedAt?: Date | null }) {
  if (status !== "VERIFIED") return null;
  const explanation = verifiedExplanation(verifiedAt);
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        title={explanation}
        className="inline-flex cursor-help rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Badge className="bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200">
          <span aria-hidden>✓&nbsp;</span>Verified<span className="sr-only">: {explanation}</span>
        </Badge>
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 hidden w-60 max-w-[80vw] rounded-lg border border-line bg-surface px-3 py-2 text-xs font-normal text-foreground shadow-lg group-focus-within:block"
      >
        {explanation}
      </span>
    </span>
  );
}

const verificationStyles: Record<VerificationStatus, string> = {
  UNVERIFIED: "bg-muted text-subtle",
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  VERIFIED: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  REJECTED: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

/** A trainer's verification status, for dashboards and admin pages. */
export function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  return <Badge className={verificationStyles[status]}>{verificationStatusLabels[status]}</Badge>;
}

const documentStyles: Record<DocumentStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  APPROVED: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  REJECTED: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge className={documentStyles[status]}>{documentStatusLabels[status]}</Badge>;
}
