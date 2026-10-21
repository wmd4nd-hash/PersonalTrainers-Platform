import type { CurrentUser } from "@/lib/auth";

/** "Save" button on the trainer's page. Implemented by the discovery feature. */
export async function FavoriteButton({ trainerId, viewer }: { trainerId: string; viewer: CurrentUser | null }) {
  void trainerId;
  void viewer;
  return null;
}
