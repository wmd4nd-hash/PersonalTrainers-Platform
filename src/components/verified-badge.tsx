import type { VerificationStatus } from "@/generated/prisma/client";
import { Badge } from "./ui";

/** Shown next to trainers whose documents an admin has checked. */
export function VerifiedBadge({ status }: { status: VerificationStatus }) {
  if (status !== "VERIFIED") return null;
  return (
    <Badge className="bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200">
      ✓ Verified
    </Badge>
  );
}
