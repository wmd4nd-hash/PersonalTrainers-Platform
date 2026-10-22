import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { cancelFromOverview, chooseBookingSlot, signup, uniqueEmail } from "./helpers";

// Each test signs up its own trainer and client, so they can run in any order and repeatedly.
test.describe.configure({ timeout: 180_000 });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
test.afterAll(() => pool.end());

/**
 * Publishes the trainer's profile with availability every day from 06:00 to
 * 22:00. The profile and availability pages belong to other features, so this
 * is set up directly to keep the spec about payments.
 */
async function openForBookings(trainerEmail: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE "TrainerProfile" SET published = true, "updatedAt" = now()
     WHERE "userId" = (SELECT id FROM "User" WHERE email = $1) RETURNING id`,
    [trainerEmail],
  );
  const trainerId = rows[0]!.id;
  for (let day = 0; day < 7; day++) {
    await pool.query(
      `INSERT INTO "AvailabilityWindow" (id, "trainerId", "dayOfWeek", "startMinute", "endMinute") VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), trainerId, day, 6 * 60, 22 * 60],
    );
  }
  return trainerId;
}

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

/** Signs up a trainer, sets up (simulated) payouts and opens their calendar. */
async function trainerWithPayouts(page: Page, name: string) {
  const email = uniqueEmail("payouts-trainer");
  await signup(page, { name, email, role: "TRAINER" });

  await page.goto("/dashboard/payouts");
  await expect(page.getByText("Not started", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Set up payouts" }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText(/payouts are simulated/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up payouts" })).toHaveCount(0);

  return openForBookings(email);
}

/** Books the first open time on the n-th bookable day and pays (simulated). Returns the booking id. */
async function bookAndPay(page: Page, trainerId: string, dayIndex: number): Promise<string> {
  await page.goto(`/trainers/${trainerId}`);
  await expect(page.getByRole("heading", { name: "Book a session" })).toBeVisible();
  await chooseBookingSlot(page, dayIndex);
  await page.getByRole("button", { name: /Book and pay/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookings\/[^/?]+/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

test("a trainer sets up payouts and earns from a new client's session, net of the new-client fee", async ({ browser }) => {
  const trainer = await newPage(browser);
  const trainerId = await trainerWithPayouts(trainer, "Robin Earnings");

  const client = await newPage(browser);
  await signup(client, { name: "Nia Newclient", email: uniqueEmail("payments-client"), role: "CLIENT" });
  await bookAndPay(client, trainerId, 0);

  // $50.00 session, 15% platform fee on a new client's first payment.
  await trainer.goto("/dashboard/earnings");
  const allTime = trainer.getByRole("region", { name: "All time" });
  await expect(allTime).toContainText("Gross$50.00");
  await expect(allTime).toContainText("Platform fees-$7.50");
  await expect(allTime).toContainText("Net$42.50");
  await expect(trainer.getByRole("region", { name: "This month" })).toContainText("Net$42.50");

  const row = trainer.getByRole("row", { name: /Session payment/ });
  await expect(row).toContainText("Nia Newclient");
  await expect(row).toContainText("$50.00");
  await expect(row).toContainText("-$7.50");
  await expect(row).toContainText("$42.50");
  await expect(trainer.getByText("Held until payouts are set up")).toHaveCount(0);

  const csv = await trainer.request.get("/api/earnings?period=all");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toMatch(/Session payment,Nia Newclient,.*,USD,50\.00,7\.50,0\.00,42\.50,0\.00/);

  // Only trainers can download a statement.
  expect((await client.request.get("/api/earnings")).status()).toBe(403);
});

test("a client sees their payments, opens a receipt and is refunded after cancelling in time", async ({ browser }) => {
  const trainer = await newPage(browser);
  const trainerId = await trainerWithPayouts(trainer, "Robin Refunds");

  const client = await newPage(browser);
  const clientEmail = uniqueEmail("payments-client");
  await signup(client, { name: "Cal Client", email: clientEmail, role: "CLIENT" });
  const first = await bookAndPay(client, trainerId, 0);
  // Two bookable days later is always more than 24 hours ahead: inside the free cancellation window.
  const second = await bookAndPay(client, trainerId, 2);

  await client.goto("/dashboard/payments");
  const firstPayment = client.locator("li", { has: client.locator(`a[href="/dashboard/payments/booking/${first}"]`) });
  const secondPayment = client.locator("li", { has: client.locator(`a[href="/dashboard/payments/booking/${second}"]`) });
  await expect(firstPayment).toContainText("Session with Robin Refunds");
  await expect(firstPayment).toContainText("$50.00");
  await expect(firstPayment).toContainText("Paid");
  await expect(secondPayment).toContainText("Paid");

  await firstPayment.getByRole("link", { name: /Receipt for/ }).click();
  await expect(client.getByRole("heading", { name: "Receipt" })).toBeVisible();
  const receipt = client.locator("#receipt");
  await expect(receipt).toContainText(first);
  await expect(receipt).toContainText(clientEmail);
  await expect(receipt).toContainText("Total paid$50.00");
  await expect(client.getByRole("button", { name: "Print receipt" })).toBeVisible();

  // Cancel the second session from the bookings overview.
  await cancelFromOverview(client, second);

  await client.goto("/dashboard/payments");
  await expect(secondPayment).toContainText("Refunded $50.00");
  await expect(secondPayment.getByText("Refunded", { exact: true })).toBeVisible();
  await expect(firstPayment).toContainText("Paid");

  await client.goto(`/dashboard/payments/booking/${second}`);
  await expect(client.locator("#receipt")).toContainText("Total after refunds$0.00");

  // Receipts are private to the client who paid.
  const stranger = await newPage(browser);
  await signup(stranger, { name: "Sid Stranger", email: uniqueEmail("payments-stranger"), role: "CLIENT" });
  await stranger.goto(`/dashboard/payments/booking/${first}`);
  await expect(stranger.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(stranger.locator("#receipt")).toHaveCount(0);
});
