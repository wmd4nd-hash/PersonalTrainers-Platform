import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "password123";

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signup(page: Page, { name, email, role }: { name: string; email: string; role: "CLIENT" | "TRAINER" }) {
  await page.goto(`/signup?role=${role}`);
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", DEMO_PASSWORD);
  await page.click("button[type=submit]");
  await expect(page).not.toHaveURL(/\/signup/);
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Days in the trainer page's booking strip that have free times. */
export function openBookingDays(page: Page) {
  return page.getByRole("radio", { name: /, \d+ free times?$/ });
}

/**
 * Picks a day in the booking strip (index into the open days; -1 for the last)
 * and the first free time on it.
 */
export async function chooseBookingSlot(page: Page, dayIndex = 0) {
  const days = openBookingDays(page);
  const day = dayIndex < 0 ? days.last() : days.nth(dayIndex);
  // The radios are visually hidden; click their visible label.
  await day.locator("xpath=..").click();
  await expect(day).toBeChecked();
  await page.locator("button[aria-pressed]").first().click();
}

/** Chooses card payment when the client also has package sessions to spend. */
export async function chooseCardPayment(page: Page) {
  const card = page.getByRole("radio", { name: /Pay by card/ });
  if (await card.count()) await card.check();
}

/** Cancels a booking from the dashboard overview and checks it moved to the Cancelled tab. */
export async function cancelFromOverview(page: Page, bookingId: string) {
  await page.goto("/dashboard");
  const item = page.locator("li", { has: page.locator(`a[href="/dashboard/bookings/${bookingId}"]`) });
  await item.getByText("Cancel session…").click();
  await item.getByRole("button", { name: "Cancel session" }).click();
  await expect(item).toHaveCount(0);
  await page.goto("/dashboard?tab=cancelled");
  await expect(page.locator(`a[href="/dashboard/bookings/${bookingId}"]`).first()).toBeVisible();
}
