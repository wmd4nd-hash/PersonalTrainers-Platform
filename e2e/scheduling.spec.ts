import { expect, test, type Locator, type Page } from "@playwright/test";
import { login, signup, uniqueEmail } from "./helpers";

/** YYYY-MM-DD, `days` after today in `timezone`. */
function dateKeyIn(timezone: string, days = 0) {
  // en-CA formats dates as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Thursday, October 22": how the booking strip names a day. */
function dayLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${key}T12:00:00Z`),
  );
}

async function logout(page: Page) {
  await page.context().clearCookies();
}

async function openTrainer(page: Page, name: string) {
  await page.goto("/trainers");
  await page.getByRole("link", { name: new RegExp(name) }).first().click();
  await expect(page.getByRole("heading", { name: "Book a session" })).toBeVisible();
}

/** The radio for one day in the booking strip. */
function dayOption(page: Page, key: string) {
  return page.getByRole("radio", { name: new RegExp(`^${dayLabel(key)},`) });
}

/** Days that have free times. */
function openDays(page: Page) {
  return page.getByRole("radio", { name: /, \d+ free times?$/ });
}

/** The radios are visually hidden; click their visible label. */
async function chooseDay(radio: Locator) {
  await radio.locator("xpath=..").click();
  await expect(radio).toBeChecked();
}

test("trainer time off covering tomorrow hides that day from clients", async ({ page }) => {
  const timezone = "Europe/Berlin"; // Lukas Becker
  const tomorrow = dateKeyIn(timezone, 1);
  const reason = `E2E day off ${Date.now()}`;
  const isSunday = new Date(`${tomorrow}T12:00:00Z`).getUTCDay() === 0; // Lukas doesn't work Sundays

  // Before: tomorrow has free times.
  await login(page, "client@example.com");
  await openTrainer(page, "Lukas Becker");
  if (!isSunday) await expect(dayOption(page, tomorrow)).toBeEnabled();

  await logout(page);
  await login(page, "lukas@example.com");
  await page.goto("/dashboard/calendar");
  await page.getByLabel("First day").fill(tomorrow);
  await expect(page.getByLabel("All day")).toBeChecked();
  await page.getByLabel("Reason (optional)").fill(reason);
  await page.getByRole("button", { name: "Add time off" }).click();
  await expect(page.getByText(/Time off added/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Upcoming time off" }).getByText(reason)).toBeVisible();

  try {
    // After: the client sees no slots that day.
    await logout(page);
    await login(page, "client@example.com");
    await openTrainer(page, "Lukas Becker");
    const day = dayOption(page, tomorrow);
    await expect(day).toBeDisabled();
    await expect(day).toHaveAccessibleName(/no free times/);
  } finally {
    // Leave Lukas's calendar as we found it.
    await logout(page);
    await login(page, "lukas@example.com");
    await page.goto("/dashboard/calendar");
    await page.getByRole("button", { name: new RegExp(`^Remove time off: .*${reason}`) }).click();
    await expect(page.getByRole("list", { name: "Upcoming time off" }).getByText(reason)).toHaveCount(0);
  }
});

test("client books an online session, reschedules it, and the trainer sees it on the calendar", async ({ page }) => {
  const clientName = `Robin Online ${Date.now() % 1_000_000}`;
  await signup(page, { name: clientName, email: uniqueEmail("sched-client"), role: "CLIENT" });

  // Aiko only offers online sessions. Book weeks ahead, well outside the cancellation window.
  await openTrainer(page, "Aiko Tanaka");
  await chooseDay(openDays(page).last());
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: /Book and pay/ }).click();

  await expect(page).toHaveURL(/\/dashboard\/bookings\/[^/?]+\?booked=1/);
  await expect(page.getByText(/You're booked/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Join video call/ })).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByRole("link", { name: "Add to calendar" })).toHaveAttribute("href", /\/ics$/);
  const bookingUrl = page.url().split("?")[0]!;
  const when = page.locator("dl dd").first();
  const originalTime = await when.innerText();

  // Reschedule to another free time.
  await page.getByRole("link", { name: "Reschedule" }).click();
  await expect(page.getByRole("heading", { name: "Reschedule session" })).toBeVisible();
  await chooseDay(openDays(page).last());
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Move session" }).click();

  await expect(page).toHaveURL(/\?rescheduled=1/);
  await expect(page.getByText(/Session moved to/)).toBeVisible();
  await expect(when).not.toHaveText(originalTime);
  await expect(page.getByRole("link", { name: /Join video call/ })).toBeVisible();

  // The trainer finds it on their week calendar.
  await logout(page);
  await login(page, "aiko@example.com");
  await page.goto(bookingUrl);
  await expect(page.getByRole("heading", { name: `Session with ${clientName}` })).toBeVisible();
  await page.getByRole("link", { name: "Show in calendar" }).click();
  await expect(page).toHaveURL(/\/dashboard\/calendar\?week=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole("link", { name: new RegExp(clientName) })).toBeVisible();
});

test("someone else's booking is not found", async ({ page }) => {
  await signup(page, { name: "Curious Client", email: uniqueEmail("sched-other"), role: "CLIENT" });
  await openTrainer(page, "Diego Ramírez");
  await chooseDay(openDays(page).last());
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: /Book and pay/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookings\//);
  const bookingPath = new URL(page.url()).pathname;

  await logout(page);
  await login(page, "priya@example.com");
  // The page streams, so the not-found UI arrives after a 200 status line.
  for (const path of [bookingPath, `${bookingPath}/reschedule`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByText("Curious Client")).toHaveCount(0);
  }
  const ics = await page.request.get(`${bookingPath.replace("/dashboard/bookings/", "/api/bookings/")}/ics`);
  expect(ics.status()).toBe(404);
});

test("availability rejects overlapping hours and copies Monday to the weekdays", async ({ page }) => {
  await signup(page, { name: "Avery Hours", email: uniqueEmail("sched-trainer"), role: "TRAINER" });
  await page.goto("/dashboard/availability");
  await expect(page.getByText("No hours set yet")).toBeVisible();

  await page.getByLabel("Day", { exact: true }).selectOption({ label: "Monday" });
  await page.getByLabel("From", { exact: true }).fill("09:00");
  await page.getByLabel("To", { exact: true }).fill("12:00");
  await page.getByRole("button", { name: "Add hours" }).click();
  await expect(page.getByText("Added Monday 09:00–12:00.")).toBeVisible();

  await page.getByLabel("From", { exact: true }).fill("11:00");
  await page.getByLabel("To", { exact: true }).fill("13:00");
  await page.getByRole("button", { name: "Add hours" }).click();
  await expect(page.getByText(/overlaps your Monday hours 09:00–12:00/)).toBeVisible();

  await page.getByRole("button", { name: "Copy to all weekdays" }).click();
  await expect(page.getByText(/Copied Monday's hours/)).toBeVisible();
  await expect(page.getByText("15 hours", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Friday 09:00–12:00" })).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the booking form's day strip scrolls instead of widening the page", async ({ page }) => {
    await login(page, "client@example.com");
    await openTrainer(page, "Maya Okafor");
    await expect(openDays(page).first()).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await chooseDay(openDays(page).last());
    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();
  });

  test("the calendar falls back to a day-by-day list without sideways scrolling", async ({ page }) => {
    await login(page, "omar@example.com");
    for (const [path, heading] of [
      ["/dashboard", "Next sessions"],
      ["/dashboard/availability", "Your week"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await page.goto("/dashboard/calendar");
    await expect(page.getByRole("heading", { level: 3, name: /^Monday, / })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: /^Sunday, / })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add time off" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
