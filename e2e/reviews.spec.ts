import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { Pool } from "pg";
import { login, signup, uniqueEmail } from "./helpers";

// Sessions can't be booked in the past through the UI, so each test sets up its
// own completed session directly in the database for a brand-new client.
config({ quiet: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.afterAll(() => pool.end());

const HOUR = 60 * 60 * 1000;

async function mayaTrainerId(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT tp.id FROM "TrainerProfile" tp JOIN "User" u ON u.id = tp."userId" WHERE u.email = $1`,
    ["maya@example.com"],
  );
  return rows[0]!.id;
}

/** Signs up a new client and gives them a completed session with Maya three days ago. */
async function clientWithCompletedSession(page: Page) {
  const email = uniqueEmail("reviewer");
  await signup(page, { name: "Riley Tester", email, role: "CLIENT" });
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM "User" WHERE email = $1`, [email]);
  const trainerId = await mayaTrainerId();
  const startsAt = new Date(Date.now() - 72 * HOUR);
  const endsAt = new Date(startsAt.getTime() + HOUR);
  await pool.query(
    `INSERT INTO "Booking" ("id", "trainerId", "clientId", "startsAt", "endsAt", "status", "priceCents", "currency", "completedAt")
     VALUES ($1, $2, $3, $4, $5, 'COMPLETED', 6500, 'gbp', $5)`,
    [`e2e-review-${randomUUID()}`, trainerId, rows[0]!.id, startsAt, endsAt],
  );
  return { trainerId };
}

const starRadio = (page: Page, stars: number) => page.getByRole("radio", { name: new RegExp(`^${stars} stars?,`) });

/** As the signed-in client, reviews their completed session from the bookings list. */
async function postReview(
  page: Page,
  { stars, comment, keyboard = false }: { stars: number; comment: string; keyboard?: boolean },
) {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Leave a review" }).click();
  await expect(page).toHaveURL(/\/dashboard\/reviews\/new\//);
  if (keyboard) {
    // Space picks one star, each arrow press adds one.
    await starRadio(page, 1).focus();
    await page.keyboard.press("Space");
    for (let i = 1; i < stars; i++) await page.keyboard.press("ArrowRight");
  } else {
    await page.locator("label").filter({ has: starRadio(page, stars) }).click();
  }
  await expect(starRadio(page, stars)).toBeChecked();
  await page.getByLabel("Your review (optional)").fill(comment);
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText("Thanks for your review!")).toBeVisible();
}

async function switchUser(page: Page, email: string) {
  await page.context().clearCookies();
  await login(page, email);
}

function reviewCount(page: Page) {
  return page
    .getByTestId("review-count")
    .innerText()
    .then((text) => Number.parseInt(text, 10));
}

test("client reviews a completed session and sees it on the trainer page", async ({ page }) => {
  const { trainerId } = await clientWithCompletedSession(page);
  const comment = `Clear coaching and a great warm-up ${randomUUID()}`;

  await postReview(page, { stars: 4, comment, keyboard: true });
  await expect(page.getByText(comment)).toBeVisible();

  // The booking now shows the rating instead of the link.
  await page.goto("/dashboard");
  await expect(page.getByText("You rated it 4★")).toBeVisible();
  await expect(page.getByRole("link", { name: "Leave a review" })).toHaveCount(0);

  await page.goto(`/trainers/${trainerId}`);
  const reviews = page.locator("#reviews");
  const card = reviews.getByRole("article").filter({ hasText: comment });
  await expect(card).toBeVisible();
  await expect(card.getByText("Riley T.")).toBeVisible();
  await expect(card.getByRole("img", { name: "4 out of 5 stars" })).toBeVisible();

  // The full list has it too.
  await reviews.getByRole("link", { name: /See all/ }).click();
  await expect(page).toHaveURL(new RegExp(`/trainers/${trainerId}/reviews$`));
  await expect(page.getByRole("heading", { name: "Reviews of Maya Okafor" })).toBeVisible();
  // The profile stays mounted (hidden) after a client-side navigation, so look at what's on screen.
  await expect(page.getByText(comment).filter({ visible: true })).toBeVisible();
});

test("trainer replies to a review and the reply shows publicly", async ({ page }) => {
  const { trainerId } = await clientWithCompletedSession(page);
  const comment = `Loved the kettlebell circuit ${randomUUID()}`;
  await postReview(page, { stars: 5, comment });

  await switchUser(page, "maya@example.com");
  await page.goto("/dashboard/reviews");
  const card = page.getByRole("article").filter({ hasText: comment });
  await card.getByRole("button", { name: "Reply" }).click();
  const reply = `Thanks Riley, see you next week! ${randomUUID()}`;
  await card.getByLabel("Your reply").fill(reply);
  await card.getByRole("button", { name: "Post reply" }).click();
  await expect(card.getByText(reply)).toBeVisible();
  await expect(card.getByRole("button", { name: "Edit reply" })).toBeVisible();

  await page.goto(`/trainers/${trainerId}`);
  const publicCard = page.locator("#reviews").getByRole("article").filter({ hasText: comment });
  await expect(publicCard.getByText("Response from Maya")).toBeVisible();
  await expect(publicCard.getByText(reply)).toBeVisible();
});

test("admin hides a review and the trainer's rating count drops", async ({ page }) => {
  const { trainerId } = await clientWithCompletedSession(page);
  const comment = `Off-topic review to moderate ${randomUUID()}`;
  await postReview(page, { stars: 1, comment });

  await page.goto(`/trainers/${trainerId}`);
  const before = await reviewCount(page);
  await expect(page.getByText(`from ${before} reviews`)).toBeAttached();

  await switchUser(page, "admin@example.com");
  await page.goto("/admin/reviews");
  const card = page.getByRole("article").filter({ hasText: comment });
  await card.getByRole("button", { name: "Hide" }).click();
  await expect(card.getByRole("button", { name: "Unhide" })).toBeVisible();
  await expect(card.getByText("Hidden", { exact: true })).toBeVisible();

  // The hidden filter finds it.
  await page.getByLabel("Show").selectOption("hidden");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/show=hidden/);
  await expect(page.getByRole("article").filter({ hasText: comment })).toBeVisible();

  await page.goto(`/trainers/${trainerId}`);
  expect(await reviewCount(page)).toBe(before - 1);
  await expect(page.getByText(`from ${before - 1} reviews`)).toBeAttached();
  await expect(page.getByText(comment)).toHaveCount(0);
});
