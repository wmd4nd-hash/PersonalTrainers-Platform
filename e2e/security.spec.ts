import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, login, signup, uniqueEmail } from "./helpers";

test("changing your password signs out your other devices but keeps this one", async ({ browser }) => {
  const email = uniqueEmail("security-sessions");
  const laptop = await (await browser.newContext()).newPage();
  await signup(laptop, { name: "Sasha Sessions", email, role: "CLIENT" });

  const phone = await (await browser.newContext()).newPage();
  await login(phone, email);
  await phone.goto("/dashboard/settings");
  await expect(phone).toHaveURL(/\/dashboard\/settings/);

  const newPassword = "a-brand-new-password";
  await laptop.goto("/dashboard/settings");
  await laptop.fill("#currentPassword", DEMO_PASSWORD);
  await laptop.fill("#newPassword", newPassword);
  await laptop.fill("#confirmPassword", newPassword);
  await laptop.getByRole("button", { name: "Change password" }).click();
  await expect(laptop.getByText(/signed out on your other devices/)).toBeVisible();

  // This device stays signed in; the other one is sent to the login page.
  await laptop.goto("/dashboard");
  await expect(laptop).toHaveURL(/\/dashboard$/);
  await phone.goto("/dashboard/settings");
  await expect(phone).toHaveURL(/\/login/);
  await login(phone, email, newPassword);
});

test("repeated wrong passwords lock the account for a while", async ({ page }) => {
  const email = uniqueEmail("security-lockout");
  await signup(page, { name: "Lee Lockout", email, role: "CLIENT" });
  await page.context().clearCookies();

  await page.goto("/login");
  // The login form's own message (Next.js's route announcer is an alert too).
  const message = page.locator("form").getByRole("alert");
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.fill("#email", email);
    await page.fill("#password", `wrong-password-${attempt}`);
    // Wait for each answer before trying again.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login"),
      page.click("button[type=submit]"),
    ]);
    const expected = attempt < 5 ? "Incorrect email or password" : /Too many failed attempts/;
    await expect(message).toContainText(expected);
  }

  // Even the right password is refused until the lock runs out.
  await page.fill("#email", email);
  await page.fill("#password", DEMO_PASSWORD);
  await page.click("button[type=submit]");
  await expect(message).toContainText(/Too many failed attempts/);
  await expect(page).toHaveURL(/\/login/);
});
