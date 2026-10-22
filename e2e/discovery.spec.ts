import { expect, test, type Page } from "@playwright/test";
import { login, signup, uniqueEmail } from "./helpers";

/** Names of the trainers in the result cards, in order. */
function resultNames(page: Page) {
  return page.locator("article h3").allTextContents();
}

test("filtering for online, Spanish-speaking trainers shows Diego and not Lukas", async ({ page }) => {
  await page.goto("/trainers");
  await expect(page.getByRole("link", { name: "Lukas Becker" })).toBeVisible();

  await page.getByLabel("Session type").selectOption("online");
  await page.getByLabel("Language").selectOption("spanish");
  await page.getByRole("button", { name: "Show trainers" }).click();

  await expect(page).toHaveURL(/format=online/);
  await expect(page).toHaveURL(/language=spanish/);
  await expect(page.getByRole("link", { name: "Diego Ramírez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lukas Becker" })).toHaveCount(0);

  // Each active filter has a chip that removes it.
  const chips = page.getByRole("list", { name: "Active filters" });
  await expect(chips.getByRole("link")).toHaveText([/Online/, /Speaks Spanish/]);
  await chips.getByRole("link", { name: "Remove filter: Online" }).click();
  await expect(page).not.toHaveURL(/format=online/);
  await expect(page.getByLabel("Session type")).toHaveValue("");
  await expect(page.getByRole("link", { name: "Diego Ramírez" })).toBeVisible();
});

test("sorting by price lists the cheapest trainers first", async ({ page }) => {
  await page.goto("/trainers");
  await page.getByLabel("Sort by").selectOption("price");
  await expect(page).toHaveURL(/sort=price/);

  // $45 Aiko, €50 Sofia, €60 Lukas, £65 Maya, $80 Diego, $90 Omar. Other tests may add trainers in between.
  const seeded = ["Aiko Tanaka", "Sofia Almeida", "Lukas Becker", "Maya Okafor", "Diego Ramírez", "Omar Haddad"];
  await expect.poll(async () => (await resultNames(page)).filter((n) => seeded.includes(n))).toEqual(seeded);
});

test("the home page search goes to matching trainers", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Goal, specialty or trainer name").fill("running");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/trainers\?q=running$/);
  await expect(page.getByRole("link", { name: "Diego Ramírez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Maya Okafor" })).toHaveCount(0);
});

test.describe("matching quiz", () => {
  // Diego coaches weekday mornings in New York.
  test.use({ timezoneId: "America/New_York" });

  test("ranks trainers and explains each match", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Take the 1-minute quiz/ }).click();
    await expect(page).toHaveURL(/\/match$/);

    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await page.getByLabel("Running").check();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // In person needs a city.
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await page.getByLabel(/^In person/).check();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter your city" })).toBeVisible();

    await page.getByLabel(/^Online/).check();
    await expect(page.getByLabel("Your city")).toBeHidden();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await page.getByLabel("Up to 100").check();
    await page.getByLabel(/^Mornings/).check();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await page.getByLabel("Language you'd like to train in").selectOption("spanish");
    await page.getByRole("button", { name: "See my matches" }).click();

    // The results URL carries the answers, so it can be shared.
    await expect(page).toHaveURL(/\/match\/results\?goal=running&format=online&budget=100&time=mornings&language=spanish&tz=America%2FNew_York$/);
    await expect(page.getByRole("heading", { name: "Your top matches" })).toBeVisible();

    const matches = page.getByRole("main").getByRole("listitem").filter({ has: page.locator("article") });
    expect(await matches.count()).toBeGreaterThanOrEqual(2);
    expect(await matches.count()).toBeLessThanOrEqual(5);

    const best = matches.first();
    await expect(best.getByRole("heading")).toHaveText("Diego Ramírez");
    const reasons = best.getByRole("list", { name: /Why Diego Ramírez is a match/ }).getByRole("listitem");
    await expect(reasons).toHaveText([/Specialises in running/, /Speaks Spanish/, /Within your budget/]);

    // Online only: trainers who only train in person aren't suggested.
    await expect(page.getByRole("link", { name: "Lukas Becker" })).toHaveCount(0);

    await page.getByRole("link", { name: "Change my answers" }).click();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.getByLabel("Running")).toBeChecked();
  });
});

test("a client saves a trainer, sees them under Saved trainers, then removes them", async ({ page }) => {
  await signup(page, { name: "Saver Client", email: uniqueEmail("saver"), role: "CLIENT" });

  await page.goto("/trainers");
  await page.getByRole("link", { name: "Maya Okafor" }).click();
  await expect(page.getByRole("heading", { name: "Maya Okafor" })).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Saved/ })).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Saved trainers" }).click();
  await expect(page).toHaveURL(/\/dashboard\/favorites$/);
  await expect(page.getByRole("link", { name: "Maya Okafor" })).toBeVisible();

  await page.getByRole("button", { name: "Remove Maya Okafor" }).click();
  await expect(page.getByText("You haven't saved any trainers yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Maya Okafor" })).toHaveCount(0);

  // Saving is undone on the trainer's page too.
  await page.goto("/trainers");
  await page.getByRole("link", { name: "Maya Okafor" }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
});

test("only clients can save trainers", async ({ page }) => {
  await page.goto("/trainers");
  await page.getByRole("link", { name: "Sofia Almeida" }).click();
  await expect(page.getByRole("link", { name: /Log in to save/ })).toBeVisible();

  await login(page, "diego@example.com");
  await page.goto("/trainers");
  await page.getByRole("link", { name: "Sofia Almeida" }).click();
  await expect(page.getByRole("heading", { name: "Book a session" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Log in to save/ })).toHaveCount(0);
});

test("trainer pages have descriptive titles and are listed for search engines", async ({ page, request }) => {
  await page.goto("/trainers");
  await page.getByRole("link", { name: "Diego Ramírez" }).click();
  await expect(page).toHaveTitle(/Diego Ramírez, personal trainer in New York/);
  const trainerPath = new URL(page.url()).pathname;

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(trainerPath);

  const robots = await (await request.get("/robots.txt")).text();
  for (const path of ["/dashboard", "/admin", "/api"]) expect(robots).toContain(`Disallow: ${path}`);

  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  expect((await request.get(manifest.icons[0].src)).ok()).toBe(true);
});
