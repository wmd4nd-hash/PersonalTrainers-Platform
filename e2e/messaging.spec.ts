import { expect, test, type Browser, type Page } from "@playwright/test";
import { login, signup, uniqueEmail } from "./helpers";

/** A page in its own browser context, so two people can be signed in at once. */
async function newPerson(browser: Browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  return context.newPage();
}

async function signUpClient(page: Page, firstName: string) {
  const name = `${firstName} ${Math.floor(Math.random() * 1e6)}`;
  const email = uniqueEmail(firstName.toLowerCase());
  await signup(page, { name, email, role: "CLIENT" });
  return { name, email };
}

async function openTrainerProfile(page: Page, trainerName: string) {
  await page.goto("/trainers");
  await page.getByRole("link", { name: new RegExp(trainerName) }).first().click();
  await expect(page.getByRole("heading", { name: trainerName })).toBeVisible();
}

test("client messages a trainer and they reply to each other", async ({ page: client, browser }) => {
  const { name: clientName } = await signUpClient(client, "Ava");

  await openTrainerProfile(client, "Maya Okafor");
  await client.getByRole("button", { name: "Message" }).click();
  await expect(client).toHaveURL(/\/dashboard\/messages\/\w+/);
  await expect(client.getByText("No messages yet")).toBeVisible();

  // Enter sends.
  const question = "Hi Maya, are you taking new clients this month?";
  await client.getByLabel("Message Maya Okafor").fill(question);
  await client.keyboard.press("Enter");
  await expect(client.getByRole("log").getByText(question)).toBeVisible();
  await expect(client.getByLabel("Message Maya Okafor")).toHaveValue("");

  // The trainer sees the unread badge and opens the conversation from the inbox.
  const trainer = await newPerson(browser);
  await login(trainer, "maya@example.com");
  const badge = trainer.getByRole("banner").getByRole("link", { name: /^Messages, \d+ unread$/ });
  await expect(badge).toBeVisible();
  await badge.click();
  await expect(trainer).toHaveURL(/\/dashboard\/messages$/);
  await trainer.getByRole("link", { name: new RegExp(clientName) }).click();
  await expect(trainer.getByRole("log").getByText(question)).toBeVisible();

  const reply = "Yes! I have mornings free. Book a slot and we'll start with an assessment.";
  await trainer.getByLabel(`Message ${clientName}`).fill(reply);
  await trainer.getByRole("button", { name: "Send" }).click();
  await expect(trainer.getByRole("log").getByText(reply)).toBeVisible();

  // The client's open conversation picks up the reply without a reload.
  await expect(client.getByRole("log").getByText(reply)).toBeVisible({ timeout: 15_000 });
  // Shift+Enter adds a new line instead of sending.
  const box = client.getByLabel("Message Maya Okafor");
  await box.fill("Great, thanks!");
  await box.press("Shift+Enter");
  await expect(box).toHaveValue("Great, thanks!\n");

  // The client read the reply while looking at it: the trainer sees "Seen" and the client has nothing unread.
  await expect(trainer.getByRole("log").getByText(/Seen$/)).toBeVisible({ timeout: 15_000 });
  await client.reload();
  await expect(client.getByRole("banner").getByRole("link", { name: "Messages", exact: true })).toBeVisible();

  await trainer.context().close();
});

test("a message with a phone number is sent with a protection notice", async ({ page: client, browser }) => {
  const { name: clientName } = await signUpClient(client, "Noah");
  await openTrainerProfile(client, "Diego Ramírez");
  await client.getByRole("button", { name: "Message" }).click();
  await expect(client).toHaveURL(/\/dashboard\/messages\/\w+/);

  const text = "Can you text me on +44 7700 900123 instead?";
  await client.getByLabel("Message Diego Ramírez").fill(text);
  await client.getByRole("button", { name: "Send" }).click();
  await expect(client.getByRole("log").getByText(text)).toBeVisible();
  const notice = client.getByRole("note").filter({ hasText: "Keep bookings and payments on" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("aren't covered by our cancellation protection or refunds");

  // The flag is stored, so the notice is still there after a reload.
  await client.reload();
  await expect(client.getByRole("note").filter({ hasText: "Keep bookings and payments on" })).toBeVisible();

  // The message was still delivered to the trainer.
  const trainer = await newPerson(browser);
  await login(trainer, "diego@example.com");
  await trainer.goto("/dashboard/messages");
  await trainer.getByRole("link", { name: new RegExp(clientName) }).click();
  await expect(trainer.getByRole("log").getByText(text)).toBeVisible();
  await trainer.context().close();
});

test("only clients get a message button", async ({ page, browser }) => {
  await openTrainerProfile(page, "Maya Okafor");
  await expect(page.getByRole("link", { name: "Log in to send a message" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Message" })).toHaveCount(0);

  const trainer = await newPerson(browser);
  await login(trainer, "diego@example.com");
  await openTrainerProfile(trainer, "Maya Okafor");
  await expect(trainer.getByRole("button", { name: "Message" })).toHaveCount(0);
  await expect(trainer.getByRole("link", { name: "Log in to send a message" })).toHaveCount(0);
  await trainer.context().close();
});

test("people outside a conversation can't open it", async ({ page: client, browser }) => {
  await signUpClient(client, "Mia");
  await openTrainerProfile(client, "Aiko Tanaka");
  await client.getByRole("button", { name: "Message" }).click();
  await expect(client).toHaveURL(/\/dashboard\/messages\/\w+/);
  const conversationUrl = new URL(client.url()).pathname;
  const conversationId = conversationUrl.split("/").pop();

  const stranger = await newPerson(browser);
  await signUpClient(stranger, "Leo");
  await stranger.goto(conversationUrl);
  await expect(stranger.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(stranger.getByRole("log")).toHaveCount(0);
  const api = await stranger.request.get(`/api/messages/${conversationId}?since=${new Date().toISOString()}`);
  expect(api.status()).toBe(404);
  await stranger.context().close();
});

test("a trainer can message a client who booked with them", async ({ page: client, browser }) => {
  const { name: clientName, email: clientEmail } = await signUpClient(client, "Zoe");
  await openTrainerProfile(client, "Maya Okafor");
  await client.locator("form button[type=button]").first().click();
  await client.getByRole("button", { name: /Book/ }).click();
  await expect(client).toHaveURL(/\/dashboard\/bookings\//);

  const trainer = await newPerson(browser);
  await login(trainer, "maya@example.com");
  await trainer.goto("/dashboard/messages");
  await trainer.getByLabel("Message a client").selectOption({ label: `${clientName} (${clientEmail})` });
  await trainer.getByRole("button", { name: "Start conversation" }).click();
  await expect(trainer).toHaveURL(/\/dashboard\/messages\/\w+/);
  // The booking shows above the thread.
  await expect(trainer.getByRole("heading", { name: "Upcoming sessions" })).toBeVisible();
  await expect(trainer.getByRole("link", { name: /GMT|BST|UTC/ })).toBeVisible();

  const hello = "Thanks for booking! Anything I should know before our first session?";
  await trainer.getByLabel(`Message ${clientName}`).fill(hello);
  await trainer.keyboard.press("Enter");
  await expect(trainer.getByRole("log").getByText(hello)).toBeVisible();
  await trainer.context().close();

  // The client sees an unread conversation in their inbox.
  await client.goto("/dashboard/messages");
  await expect(client.getByRole("banner").getByRole("link", { name: "Messages, 1 unread" })).toBeVisible();
  const row = client.getByRole("link", { name: /Maya Okafor/ });
  await expect(row).toContainText(hello.slice(0, 30));
  await expect(row).toContainText("1 unread");
});

test("sending is paused after 20 messages in a minute", async ({ page: client }) => {
  await signUpClient(client, "Eli");
  await openTrainerProfile(client, "Sofia Almeida");
  await client.getByRole("button", { name: "Message" }).click();
  await expect(client).toHaveURL(/\/dashboard\/messages\/\w+/);

  const box = client.getByLabel("Message Sofia Almeida");
  for (let i = 1; i <= 20; i++) {
    await box.fill(`Quick question ${i}`);
    await box.press("Enter");
    await expect(client.getByRole("log").getByText(new RegExp(`Quick question ${i}$`))).toBeVisible();
  }
  // Wait until all twenty are stored before trying the twenty-first.
  await expect(client.getByText("Sending…")).toHaveCount(0);
  await box.fill("One more thing");
  await box.press("Enter");
  await expect(client.getByRole("alert").filter({ hasText: "sending messages very quickly" })).toBeVisible();
  // The unsent text is given back so nothing is lost.
  await expect(box).toHaveValue("One more thing");
});
