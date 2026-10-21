import type { CurrentUser } from "@/lib/auth";

/** Session packages on the trainer's public page. Implemented by the packages feature. */
export async function PackagesSection({
  trainer,
  viewer,
}: {
  trainer: { id: string; currency: string; sessionRateCents: number };
  viewer: CurrentUser | null;
}) {
  void trainer;
  void viewer;
  return null;
}
