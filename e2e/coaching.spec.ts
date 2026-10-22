import { expect, test, type Browser, type Page } from "@playwright/test";
import { login, signup, uniqueEmail } from "./helpers";

/** Signs in as `email` in a fresh browser context, so several users can act in one test. */
async function signedIn(browser: Browser, email: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  await login(page, email);
  return page;
}

async function openProgram(page: Page, title: string) {
  await page.goto("/dashboard/programs");
  await page.getByRole("heading", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test("trainer duplicates and assigns a program, client logs it, trainer reviews and adds a note", async ({
  browser,
}) => {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const programTitle = `Strength block ${stamp}`;
  const exerciseName = `Landmine press ${stamp}`;
  const note = `Push the landmine press to 45 kg next week (${stamp})`;

  const trainer = await signedIn(browser, "maya@example.com");
  const client = await signedIn(browser, "client@example.com");

  await test.step("trainer duplicates the seeded program and renames the copy", async () => {
    await openProgram(trainer, "Beginner strength");
    await trainer.getByRole("button", { name: "Duplicate" }).click();
    await expect(trainer.getByRole("heading", { level: 1, name: "Beginner strength (copy)" })).toBeVisible();
    await expect(trainer.getByText("Program duplicated")).toBeVisible();
    // Workouts and exercises came along.
    await expect(trainer.getByRole("group", { name: "Day 1: Lower body" })).toContainText("Goblet squat");
    await expect(trainer.getByRole("group", { name: "Day 3: Full body" })).toContainText("Deadlift");

    await trainer.getByRole("button", { name: "Edit details" }).click();
    await trainer.locator("#program-title").fill(programTitle);
    await trainer.getByRole("button", { name: "Save changes" }).click();
    await expect(trainer.getByRole("heading", { level: 1, name: programTitle })).toBeVisible();
  });

  await test.step("trainer adds, moves and edits an exercise", async () => {
    const day1 = trainer.getByRole("group", { name: "Day 1: Lower body" });
    const exercises = day1.getByRole("list", { name: "Exercises in Lower body" });
    const addForm = day1.getByRole("form", { name: "Add an exercise" });
    await addForm.getByLabel("Exercise").fill(exerciseName);
    await addForm.getByLabel("Sets").fill("3");
    await addForm.getByLabel("Reps").fill("6");
    await addForm.getByRole("button", { name: "Add" }).click();
    await expect(exercises.getByRole("listitem")).toHaveCount(5);
    await expect(exercises.getByRole("listitem").nth(4)).toContainText(exerciseName);

    await day1.getByRole("button", { name: `Move ${exerciseName} up` }).click();
    await expect(exercises.getByRole("listitem").nth(3)).toContainText(exerciseName);

    await day1.getByRole("button", { name: `Edit ${exerciseName}` }).click();
    const editForm = day1.getByRole("form", { name: `Edit ${exerciseName}` });
    await editForm.getByLabel("Reps").fill("5");
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(editForm).toHaveCount(0);
    await expect(exercises.getByRole("listitem").filter({ hasText: exerciseName })).toContainText("3 × 5");
  });

  await test.step("trainer assigns the copy to a client with a start date", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await trainer.getByLabel("Assign to").selectOption({ label: "Sam Client (client@example.com)" });
    await trainer.getByLabel("Start date (optional)").fill(today);
    await trainer.getByRole("button", { name: "Assign program" }).click();
    await expect(trainer.getByRole("link", { name: "Sam Client" })).toBeVisible();
    await expect(trainer.getByRole("button", { name: "Unassign Sam Client" })).toBeVisible();
  });

  await test.step("client logs the workout with weights", async () => {
    await openProgram(client, programTitle);
    const day1 = client.getByRole("group", { name: "Day 1: Lower body" });
    await expect(day1.getByText("Not done yet")).toBeVisible();
    await day1.getByRole("link", { name: /Log this workout/ }).click();
    await expect(client.getByRole("heading", { level: 1, name: "Day 1: Lower body" })).toBeVisible();

    const press = client.getByRole("group", { name: exerciseName });
    await expect(press).toContainText("Target 3 × 5");
    await press.getByLabel("Sets done").fill("3");
    await press.getByLabel("Reps").fill("5");
    await press.getByLabel("Weight (kg)").fill("42.5");
    await client.getByRole("group", { name: "Goblet squat" }).getByLabel("Weight (kg)").fill("20");
    await client.getByLabel("Effort (1-10)").selectOption("8");
    await client.getByLabel("Notes").fill("Felt strong today");
    await client.getByRole("button", { name: "Save workout" }).click();
    await expect(client).toHaveURL(/\/dashboard\/progress\?logged=/);
    await expect(client.getByText("Workout saved. Nice work!")).toBeVisible();
  });

  await test.step("client sees the log in progress with a personal best", async () => {
    await expect(client.getByRole("region", { name: "This week" })).toContainText("This week");
    const best = client
      .getByRole("list", { name: "Personal bests" })
      .getByRole("listitem")
      .filter({ hasText: exerciseName });
    await expect(best).toContainText("Best 42.5 kg");
    // Epley: 42.5 × (1 + 5/30) = 49.58
    await expect(best).toContainText("Estimated 1-rep max 49.6 kg");

    const latest = client.getByRole("list", { name: "Workout history" }).getByRole("listitem").first();
    await expect(latest).toContainText("Day 1: Lower body");
    await expect(latest).toContainText(programTitle);
    await latest.getByText("Day 1: Lower body").click();
    await expect(latest.getByRole("row").filter({ hasText: exerciseName })).toContainText("42.5 kg");
    await expect(latest.getByText("Felt strong today")).toBeVisible();

    // Back on the program, the workout now shows when it was last done.
    await openProgram(client, programTitle);
    await expect(client.getByRole("group", { name: "Day 1: Lower body" })).toContainText("Last done today");
  });

  let clientUrl = "";
  await test.step("trainer finds the client, sees the log and adds a private note", async () => {
    await trainer.goto("/dashboard/clients");
    await trainer.getByRole("searchbox", { name: "Search clients by name" }).fill("Sam");
    await trainer.getByRole("button", { name: "Search" }).click();
    await expect(trainer).toHaveURL(/q=Sam/);
    const row = trainer.getByRole("list", { name: "Your clients" }).getByRole("listitem").filter({ hasText: "Sam Client" });
    await expect(row).toContainText("Last workout logged");
    await expect(row).toContainText("today");
    await row.getByRole("link", { name: "Sam Client" }).click();
    await expect(trainer.getByRole("heading", { level: 1, name: "Sam Client" })).toBeVisible();
    clientUrl = trainer.url();

    const latest = trainer.getByRole("list", { name: "Workout history" }).getByRole("listitem").first();
    await latest.getByText("Day 1: Lower body").click();
    await expect(latest.getByRole("row").filter({ hasText: exerciseName })).toContainText("42.5 kg");
    await expect(trainer.getByRole("link", { name: /Message Sam/ })).toHaveAttribute("href", "/dashboard/messages");

    await trainer.getByLabel("New note").fill(note);
    await trainer.getByRole("button", { name: "Add note" }).click();
    await expect(trainer.getByRole("list", { name: "Notes" }).getByText(note)).toBeVisible();
    await expect(trainer.getByLabel("New note")).toHaveValue("");
  });

  await test.step("the client can't open the trainer's client page", async () => {
    await client.goto(clientUrl);
    await expect(client).toHaveURL(/\/dashboard$/);
    await expect(client.getByText(note)).toHaveCount(0);
  });

  await trainer.context().close();
  await client.context().close();
});

test("trainer deletes a program only after confirming", async ({ page }) => {
  const title = `Delete me ${Date.now().toString(36)}`;
  await login(page, "maya@example.com");
  await page.goto("/dashboard/programs");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create program" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  await page.getByRole("button", { name: "Delete program" }).click();
  await expect(page.getByText(`Delete “${title}” for good?`)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  await page.getByRole("button", { name: "Delete program" }).click();
  await page.getByRole("button", { name: "Yes, delete it" }).click();
  await expect(page).toHaveURL(/\/dashboard\/programs\?deleted=1/);
  await expect(page.getByText("Program deleted.")).toBeVisible();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
});

test("programs and workout logs are private to the trainer and assigned clients", async ({ browser }) => {
  const client = await signedIn(browser, "client@example.com");
  await openProgram(client, "Beginner strength");
  const programUrl = client.url();
  const logUrl = await client
    .getByRole("group", { name: "Day 1: Lower body" })
    .getByRole("link", { name: /Log this workout/ })
    .getAttribute("href");
  expect(logUrl).toMatch(/^\/dashboard\/progress\/log\//);

  // A brand-new client has no assignment, so neither page exists for them.
  const stranger = await (await browser.newContext()).newPage();
  await signup(stranger, { name: "Nosy Client", email: uniqueEmail("nosy"), role: "CLIENT" });
  await stranger.goto(logUrl!);
  await expect(stranger.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await stranger.goto(programUrl);
  await expect(stranger.getByRole("heading", { name: "Page not found" })).toBeVisible();

  // Another trainer can't open Maya's program either.
  const diego = await signedIn(browser, "diego@example.com");
  await diego.goto(programUrl);
  await expect(diego.getByRole("heading", { name: "Page not found" })).toBeVisible();

  await client.context().close();
  await stranger.context().close();
  await diego.context().close();
});

test("progress and client pages fit a phone screen", async ({ browser }) => {
  const phone = { width: 390, height: 844 };
  const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  const client = await signedIn(browser, "client@example.com", phone);
  await client.goto("/dashboard/progress");
  await expect(client.getByRole("heading", { name: "Personal bests" })).toBeVisible();
  expect(await fits(client)).toBe(true);
  await openProgram(client, "Beginner strength");
  expect(await fits(client)).toBe(true);

  const trainer = await signedIn(browser, "maya@example.com", phone);
  await trainer.goto("/dashboard/clients");
  await trainer.getByRole("link", { name: "Sam Client" }).click();
  await expect(trainer.getByRole("heading", { level: 1, name: "Sam Client" })).toBeVisible();
  expect(await fits(trainer)).toBe(true);

  await client.context().close();
  await trainer.context().close();
});
