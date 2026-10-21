import type { CurrentUser } from "@/lib/auth";

/** "Message" button on the trainer's page. Implemented by the messaging feature. */
export async function MessageButton({ trainerId, viewer }: { trainerId: string; viewer: CurrentUser | null }) {
  void trainerId;
  void viewer;
  return null;
}
