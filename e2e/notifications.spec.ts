import { expect, test, type Page } from "@playwright/test";
import { DEMO_PASSWORD, login, signup, uniqueEmail } from "./helpers";

/** Books the first open slot with a trainer, paying by (simulated) card. */
async function bookFirstSlot(page: Page, trainerName: string) {
  await page.goto("/trainers");
  await page.getByRole("link", { name: new RegExp(trainerName) }).first().click();
  await expect(page.getByRole("heading", { name: "Book a session" })).toBeVisible();
  const form = page.locator("form", { has: page.getByLabel("Day") });
  await form.locator("button[type=button]").first().click();
  await form.getByRole("button", { name: /^Book/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookings\/[^/?]+/);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
}

function bellPanel(page: Page) {
  return page.getByRole("region", { name: "Latest notifications" });
}

async function openBell(page: Page) {
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(bellPanel(page)).toBeVisible();
}

/** Opens the outbox as the signed-in admin and waits for an email to the address to arrive. */
async function openEmailInOutbox(page: Page, to: string, subject: RegExp) {
  await expect(async () => {
    await page.goto(`/admin/outbox?q=${encodeURIComponent(to)}`);
    await expect(page.getByRole("link", { name: subject })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("link", { name: subject }).click();
  return page.getByTestId("email-text").innerText();
}

test("booking a session puts a notification in the bell for the client and the trainer", async ({ page }) => {
  const clientName = `Bell Tester ${Math.floor(Math.random() * 1e6)}`;
  await signup(page, { name: clientName, email: uniqueEmail("bell"), role: "CLIENT" });
  await bookFirstSlot(page, "Sofia Almeida");

  // Client: unread badge and the confirmation in the panel.
  await expect(page.getByRole("button", { name: /^Notifications, \d+ unread$/ })).toBeVisible();
  await openBell(page);
  await expect(bellPanel(page).getByRole("button", { name: /Session booked with Sofia Almeida/ })).toBeVisible();
  await logout(page);

  // Trainer: the new booking, which opens the booking and is then read.
  await login(page, "sofia@example.com");
  await openBell(page);
  const item = bellPanel(page).getByRole("button", { name: new RegExp(`Unread: New booking from ${clientName}`) });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(/\/dashboard\/bookings\//);

  await page.goto("/dashboard/notifications");
  await expect(page.getByRole("button", { name: `New booking from ${clientName}`, exact: true })).toBeVisible();

  // Mark all as read empties the unread filter.
  if (await page.getByRole("button", { name: "Mark all as read" }).isVisible()) {
    await page.getByRole("button", { name: "Mark all as read" }).click();
  }
  await page.getByRole("link", { name: /^Unread/ }).click();
  await expect(page.getByText("You're all caught up. There are no unread notifications.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
});

test("forgot password: reset by email, then log in with the new password", async ({ page }) => {
  const email = uniqueEmail("reset");
  const newPassword = "brand-new-password-42";
  await signup(page, { name: "Reset Tester", email, role: "CLIENT" });
  await logout(page);

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await expect(page.getByText(/If an account exists for that email, we've emailed you a link/)).toBeVisible();

  // Unknown addresses get exactly the same answer.
  await page.goto("/forgot-password");
  await page.fill("#email", uniqueEmail("nobody"));
  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await expect(page.getByText(/If an account exists for that email, we've emailed you a link/)).toBeVisible();

  // An admin finds the reset email in the outbox.
  await login(page, "admin@example.com");
  const text = await openEmailInOutbox(page, email, /Reset your password/);
  const link = text.match(/https?:\/\/\S+\/reset-password\?token=\S+/)?.[0];
  expect(link).toBeTruthy();
  const resetPath = (() => {
    const url = new URL(link!);
    return `${url.pathname}${url.search}`;
  })();
  await logout(page);

  await page.goto(resetPath);
  await page.fill("#password", newPassword);
  await page.fill("#confirmPassword", "something-else");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("The passwords don't match")).toBeVisible();

  await page.fill("#password", newPassword);
  await page.fill("#confirmPassword", newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password has been changed")).toBeVisible();

  // The link only works once.
  await page.goto(resetPath);
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();

  // The old password no longer works; the new one does.
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", DEMO_PASSWORD);
  await page.click("button[type=submit]");
  await expect(page.getByText("Incorrect email or password")).toBeVisible();
  await login(page, email, newPassword);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("settings: turning email notifications off stops booking emails", async ({ page }) => {
  const email = uniqueEmail("prefs");
  await signup(page, { name: "Prefs Tester", email, role: "CLIENT" });
  await page.goto("/dashboard/settings");

  const toggle = page.getByRole("checkbox", { name: /Email me about activity on my account/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.getByRole("button", { name: "Save email settings" }).click();
  await expect(page.getByText(/Email notifications are off/)).toBeVisible();
  await page.reload();
  await expect(toggle).not.toBeChecked();

  // A booking still notifies in the app, but no email is queued.
  await bookFirstSlot(page, "Lukas Becker");
  await openBell(page);
  await expect(bellPanel(page).getByRole("button", { name: /Session booked with Lukas Becker/ })).toBeVisible();

  await page.goto("/dashboard/settings");
  await toggle.check();
  await page.getByRole("button", { name: "Save email settings" }).click();
  await expect(page.getByText("Email notifications are on.")).toBeVisible();
  await page.reload();
  await expect(toggle).toBeChecked();
  await logout(page);

  await login(page, "admin@example.com");
  await page.goto(`/admin/outbox?q=${encodeURIComponent(email)}`);
  await expect(page.getByText("No emails match these filters.")).toBeVisible();
});

test("calendar feed: the private link returns the user's sessions as text/calendar", async ({ page }) => {
  await signup(page, { name: "Calendar Tester", email: uniqueEmail("ics"), role: "CLIENT" });
  await bookFirstSlot(page, "Diego Ramírez");

  await page.goto("/dashboard/settings");
  const field = page.getByLabel("Your private calendar link");
  const url = await field.inputValue();
  expect(url).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]+$/);
  const path = new URL(url).pathname;

  const feed = await page.request.get(path);
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  const ics = await feed.text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("SUMMARY:Training with Diego Ramírez");
  expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);

  // Resetting the link turns the old one off.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset link" }).click();
  await expect(page.getByText(/Your calendar link was reset/)).toBeVisible();
  await expect(field).not.toHaveValue(url);
  const newPath = new URL(await field.inputValue()).pathname;
  expect((await page.request.get(path)).status()).toBe(404);
  expect((await page.request.get(newPath)).status()).toBe(200);
});

test("the email outbox is for admins only", async ({ page }) => {
  await login(page, "client@example.com");
  await page.goto("/admin/outbox");
  await expect(page).not.toHaveURL(/\/admin/);
});
