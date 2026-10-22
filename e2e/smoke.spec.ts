import { expect, test } from "@playwright/test";
import { chooseBookingSlot, chooseCardPayment, login } from "./helpers";

test("client can find a trainer and book a session", async ({ page }) => {
  await login(page, "client@example.com");
  await page.goto("/trainers");
  await page.getByRole("link", { name: /Maya Okafor/ }).click();
  await expect(page.getByRole("heading", { name: "Book a session" })).toBeVisible();
  await chooseBookingSlot(page);
  await chooseCardPayment(page);
  await page.getByRole("button", { name: /Book and pay/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookings\//);
});

test("admin lands on the admin area", async ({ page }) => {
  await login(page, "admin@example.com");
  await expect(page).toHaveURL(/\/admin/);
});
