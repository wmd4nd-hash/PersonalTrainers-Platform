import { redirect } from "next/navigation";
import { requireTrainerProfileId } from "@/lib/auth";
import { syncPayoutsStatus, type PayoutStatus } from "@/lib/payments";

/**
 * Stripe sends trainers here when they leave onboarding (finished or not).
 * Reads their account straight from Stripe so the page shows the real status
 * without waiting for the account.updated webhook.
 */
export async function GET() {
  const trainerId = await requireTrainerProfileId();
  let status: PayoutStatus | "error";
  try {
    status = await syncPayoutsStatus(trainerId);
  } catch (err) {
    console.error("Could not read the trainer's Stripe account", err);
    status = "error";
  }
  redirect(`/dashboard/payouts?onboarding=${status}`);
}
