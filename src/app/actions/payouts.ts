"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireTrainerProfileId } from "@/lib/auth";
import {
  createPayoutsDashboardLink,
  createPayoutsOnboardingLink,
  paymentsEnabled,
  setUpSimulatedPayouts,
} from "@/lib/payments";
import type { FormState } from "@/lib/validation";

/**
 * "Set up payouts" and "Continue setup": sends the trainer to Stripe's hosted
 * onboarding. Without Stripe keys the account is simulated and active at once.
 */
export async function startPayoutsSetup(_prev: FormState, _formData: FormData): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();

  if (!paymentsEnabled()) {
    await setUpSimulatedPayouts(trainerId);
    refresh();
    return { ok: true };
  }

  let url: string;
  try {
    url = await createPayoutsOnboardingLink(trainerId);
  } catch (err) {
    console.error("Could not start Stripe onboarding", err);
    return { error: "We couldn't reach Stripe just now. Please try again in a minute." };
  }
  redirect(url);
}

/** Opens the trainer's Stripe Express dashboard (balance, payout schedule, bank details). */
export async function openPayoutsDashboard(_prev: FormState, _formData: FormData): Promise<FormState> {
  const trainerId = await requireTrainerProfileId();

  let url: string;
  try {
    url = await createPayoutsDashboardLink(trainerId);
  } catch (err) {
    console.error("Could not open the Stripe Express dashboard", err);
    return { error: "We couldn't open your Stripe dashboard just now. Please try again in a minute." };
  }
  redirect(url);
}
