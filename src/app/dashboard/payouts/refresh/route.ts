import { redirect } from "next/navigation";
import { requireTrainerProfileId } from "@/lib/auth";
import { createPayoutsOnboardingLink, paymentsEnabled } from "@/lib/payments";

/**
 * Stripe sends trainers here when their onboarding link has expired or was
 * already used. Make a fresh link and send them straight back.
 */
export async function GET() {
  const trainerId = await requireTrainerProfileId();
  if (!paymentsEnabled()) redirect("/dashboard/payouts");

  let url: string;
  try {
    url = await createPayoutsOnboardingLink(trainerId);
  } catch (err) {
    console.error("Could not refresh the Stripe onboarding link", err);
    redirect("/dashboard/payouts?onboarding=error");
  }
  redirect(url);
}
