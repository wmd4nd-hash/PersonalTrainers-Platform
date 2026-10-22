import Link from "next/link";
import { getOrCreateConversation } from "@/app/actions/messages";
import { SubmitButton } from "@/components/submit-button";
import type { CurrentUser } from "@/lib/auth";

/** "Message" button on the trainer's page. Only clients can start a conversation. */
export async function MessageButton({ trainerId, viewer }: { trainerId: string; viewer: CurrentUser | null }) {
  if (!viewer) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        Log in to send a message
      </Link>
    );
  }
  if (viewer.role !== "CLIENT") return null;

  return (
    <form action={getOrCreateConversation.bind(null, trainerId)}>
      <SubmitButton variant="secondary" pendingText="Opening…">
        Message
      </SubmitButton>
    </form>
  );
}
