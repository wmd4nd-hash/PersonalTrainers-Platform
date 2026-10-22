import { expect, test, type Browser, type Page } from "@playwright/test";
import { cancelFromOverview, chooseBookingSlot, login, signup, uniqueEmail } from "./helpers";

// Diego charges $80.00 a session, cancels free up to 24 hours ahead and offers in-person sessions.
const TRAINER = { email: "diego@example.com", name: "Diego Ramírez" };

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/** A list item holding a card whose heading is `title`. */
function cardFor(page: Page, title: string) {
  return page.locator("li", { has: page.getByRole("heading", { name: title, exact: true }) });
}

/** Trainer creates a 3-session package for $210.00 ($70.00 a session, 12% off). */
async function createPackage(page: Page, title: string) {
  await login(page, TRAINER.email);
  await page.goto("/dashboard/packages");
  const form = page.locator("form", { has: page.getByRole("button", { name: "Create package" }) });
  await form.getByLabel("Name").fill(title);
  await form.getByLabel("Sessions").fill("3");
  await form.getByLabel(/Total price/).fill("210");
  await form.getByLabel(/Valid for/).fill("30");
  await expect(form.getByText(/\$70\.00 per session\. Clients save 12% \(\$30\.00\)/)).toBeVisible();
  await form.getByRole("button", { name: "Create package" }).click();
  await expect(form.getByText("Package created and on sale.")).toBeVisible();

  const card = cardFor(page, title);
  await expect(card).toContainText("On sale");
  await expect(card).toContainText("$70.00");
  await expect(card).toContainText("12% ($30.00)");
}

/** New client signs up, finds the trainer and buys the package. */
async function buyAsNewClient(page: Page, title: string, name: string) {
  await signup(page, { name, email: uniqueEmail("package-client"), role: "CLIENT" });
  await page.goto("/trainers");
  await page.getByRole("link", { name: new RegExp(TRAINER.name) }).first().click();

  const offer = cardFor(page, title);
  await expect(offer).toContainText("$210.00");
  await expect(offer).toContainText("$70.00 per session");
  await expect(offer).toContainText("Save 12%");
  await expect(offer).toContainText("use within 30 days");
  await offer.getByRole("button", { name: `Buy ${title} for $210.00` }).click();

  await expect(page).toHaveURL(/\/dashboard\/packages\?purchased=/);
  await expect(page.getByText(`${title} with ${TRAINER.name} is ready`)).toBeVisible();
  await expect(cardFor(page, title)).toContainText("3 of 3 sessions left");
}

test("client buys a package, books with it and gets the session back after cancelling in time", async ({
  browser,
}) => {
  const title = uniqueTitle("Starter trio");
  await createPackage(await newPage(browser), title);

  const client = await newPage(browser);
  await buyAsNewClient(client, title, "Pat Package");

  // Book a session as far ahead as possible, so cancelling is well inside the free window.
  await cardFor(client, title).getByRole("link", { name: "Book a session" }).click();
  await expect(client.getByRole("heading", { name: "Book a session" })).toBeVisible();
  await client.getByRole("radio", { name: new RegExp(`${title} \\(3 left\\)`) }).check();
  await chooseBookingSlot(client, -1);
  await client.getByRole("button", { name: "Book with package" }).click();
  await expect(client).toHaveURL(/\/dashboard\/bookings\//);
  const bookingId = new URL(client.url()).pathname.split("/").pop()!;

  await client.goto("/dashboard/packages");
  const purchase = cardFor(client, title);
  await expect(purchase).toContainText("2 of 3 sessions left");
  await expect(purchase).toContainText("Booked with this package");

  await cancelFromOverview(client, bookingId);

  await client.goto("/dashboard/packages");
  await expect(cardFor(client, title)).toContainText("3 of 3 sessions left");
  await expect(cardFor(client, title)).not.toContainText("Booked with this package");
});

test("trainer refunds unused sessions and takes the package off sale", async ({ browser }) => {
  const title = uniqueTitle("Refund trio");
  const trainer = await newPage(browser);
  await createPackage(trainer, title);

  const client = await newPage(browser);
  const clientName = `Robin Refund ${Date.now().toString(36)}`;
  await buyAsNewClient(client, title, clientName);

  // The sale shows up for the trainer, who refunds it in full (nothing used yet).
  await trainer.goto("/dashboard/packages");
  const row = trainer.locator("tr", { hasText: clientName });
  await expect(row).toContainText("0 / 3");
  await expect(row).toContainText("Active");
  await row.getByRole("button", { name: "Refund unused sessions" }).click();
  await expect(row).toContainText(`Refund $210.00 for 3 unused sessions to ${clientName}?`);
  await row.getByRole("button", { name: "Confirm refund" }).click();
  await expect(row).toContainText("Cancelled");
  await expect(row).toContainText("Refunded $210.00");
  await expect(row.getByRole("button", { name: "Refund unused sessions" })).toHaveCount(0);

  // The client sees it in their history, and can no longer book with it.
  await client.reload();
  const history = cardFor(client, title);
  await expect(history).toContainText("Cancelled");
  await expect(history).toContainText("Refunded $210.00");
  await expect(client.getByRole("link", { name: "Book a session" })).toHaveCount(0);

  // Deactivating hides the package from the public profile.
  await trainer.getByRole("button", { name: `Deactivate ${title}` }).click();
  await expect(cardFor(trainer, title)).toContainText("Inactive");
  await client.goto("/trainers");
  await client.getByRole("link", { name: new RegExp(TRAINER.name) }).first().click();
  await expect(client.getByRole("heading", { name: "Book a session" })).toBeVisible();
  await expect(client.getByRole("heading", { name: title })).toHaveCount(0);

  // Reactivating puts it back.
  await trainer.getByRole("button", { name: `Reactivate ${title}` }).click();
  await expect(cardFor(trainer, title)).toContainText("On sale");
  await client.reload();
  await expect(client.getByRole("heading", { name: title })).toBeVisible();
});
