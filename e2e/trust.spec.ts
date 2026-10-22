import { expect, test, type Browser } from "@playwright/test";
import { login, signup, uniqueEmail } from "./helpers";

/** A tiny PDF. The server checks a file's first bytes, so the name alone isn't enough. */
function pdf(title: string) {
  return {
    name: `${title}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from(
      `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
      "latin1",
    ),
  };
}

/** A 1×1 PNG. */
function png(name: string) {
  return {
    name: `${name}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    ),
  };
}

/** Each person gets their own browser context, so their sessions don't mix. */
async function openAs(browser: Browser, email?: string) {
  const page = await (await browser.newContext()).newPage();
  if (email) await login(page, email);
  return page;
}

test("a trainer is verified once an admin approves their certificate and insurance", async ({ browser }) => {
  const name = `Verify Trainer ${Date.now()}`;
  const trainer = await openAs(browser);
  await signup(trainer, { name, email: uniqueEmail("verify-trainer"), role: "TRAINER" });

  // Publish the profile so it has a public page.
  await trainer.goto("/dashboard/profile");
  await trainer.getByLabel("Publish my profile so clients can find and book me").check();
  await trainer.getByRole("button", { name: "Save profile" }).click();
  const profileLink = trainer.getByRole("link", { name: /^\/trainers\// });
  await expect(profileLink).toBeVisible();
  const profilePath = (await profileLink.getAttribute("href"))!;

  await trainer.goto("/dashboard/verification");
  await expect(trainer.getByText("Not verified", { exact: true })).toBeVisible();

  // A text file renamed to .pdf is refused.
  await trainer.getByLabel("Document type").selectOption("CERTIFICATION");
  await trainer.setInputFiles("#file", {
    name: "not-a-certificate.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("just some text"),
  });
  await trainer.getByRole("button", { name: "Upload document" }).click();
  await expect(trainer.getByText("That file doesn't look like a PDF, JPEG or PNG file.")).toBeVisible();

  for (const [kind, title] of [
    ["CERTIFICATION", "personal-trainer-certificate"],
    ["INSURANCE", "liability-insurance"],
  ] as const) {
    await trainer.getByLabel("Document type").selectOption(kind);
    await trainer.getByLabel("Expiry date (optional)").fill("2030-12-31");
    await trainer.setInputFiles("#file", pdf(title));
    await trainer.getByRole("button", { name: "Upload document" }).click();
    await expect(trainer.getByRole("link", { name: `${title}.pdf` })).toBeVisible();
  }
  await expect(trainer.getByText("In review", { exact: true })).toBeVisible();

  // The trainer can open their own document; nobody else can.
  const fileHref = (await trainer.getByRole("link", { name: "liability-insurance.pdf" }).getAttribute("href"))!;
  const own = await trainer.request.get(fileHref);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("application/pdf");
  expect(own.headers()["x-content-type-options"]).toBe("nosniff");
  const stranger = await openAs(browser, "client@example.com");
  expect((await stranger.request.get(fileHref)).status()).toBe(404);

  const admin = await openAs(browser, "admin@example.com");
  await admin.goto("/admin/verification");
  for (const kind of ["Certification", "Insurance"]) {
    const label = `${kind} from ${name}`;
    const item = admin.getByRole("listitem", { name: label });
    await expect(item.getByRole("link", { name: /^Open / })).toBeVisible();
    await item.getByRole("button", { name: `Approve ${label}` }).click();
    await expect(item).toHaveCount(0);
  }
  expect((await admin.request.get(fileHref)).status()).toBe(200);

  const visitor = await openAs(browser);
  await visitor.goto(profilePath);
  const badge = visitor.getByTitle(/^Certification and insurance checked by our team on /);
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("Verified");

  await trainer.reload();
  await expect(trainer.getByText("Clients see a Verified badge on your profile.", { exact: false })).toBeVisible();
});

test("a trainer adds and removes their profile photo", async ({ browser }) => {
  const name = `Photo Trainer ${Date.now()}`;
  const trainer = await openAs(browser);
  await signup(trainer, { name, email: uniqueEmail("photo-trainer"), role: "TRAINER" });
  await trainer.goto("/dashboard/profile");

  // The real type is checked on the server, whatever the file is called.
  await trainer.setInputFiles("#photo", { name: "me.png", mimeType: "image/png", buffer: Buffer.from("not a photo") });
  await trainer.getByRole("button", { name: "Upload photo" }).click();
  await expect(trainer.getByText("That file doesn't look like a JPEG, PNG or WebP image.")).toBeVisible();

  await trainer.setInputFiles("#photo", png("me"));
  await expect(trainer.getByAltText("Preview of your new photo")).toBeVisible();
  await trainer.getByRole("button", { name: "Upload photo" }).click();
  await expect(trainer.getByText("Your new photo is live.")).toBeVisible();
  await expect(trainer.getByRole("button", { name: "Replace photo" })).toBeVisible();

  // Profile photos are public, even to visitors who aren't signed in.
  const src = (await trainer.getByRole("img", { name }).first().getAttribute("src"))!;
  const visitor = await openAs(browser);
  const photo = await visitor.request.get(src);
  expect(photo.status()).toBe(200);
  expect(photo.headers()["content-type"]).toBe("image/png");
  expect(photo.headers()["cache-control"]).toContain("public");

  await trainer.getByRole("button", { name: "Remove photo" }).click();
  await expect(trainer.getByText("Photo removed.")).toBeVisible();
  await expect(trainer.getByRole("img", { name })).toHaveCount(0);
  expect((await visitor.request.get(src)).status()).toBe(404);
});

test("a suspended client is signed out and can't log back in", async ({ browser }) => {
  const email = uniqueEmail("suspend-client");
  const client = await openAs(browser);
  await signup(client, { name: "Suspend Me", email, role: "CLIENT" });

  const admin = await openAs(browser, "admin@example.com");
  await admin.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  await admin.getByRole("link", { name: /Suspend Me/ }).click();
  await admin.getByRole("button", { name: "Suspend account" }).click();
  await expect(admin.getByRole("button", { name: "Lift suspension" })).toBeVisible();

  // Their open session stops working...
  await client.goto("/dashboard");
  await expect(client).toHaveURL(/\/login/);

  // ...and they can't sign in again.
  await client.fill("#email", email);
  await client.fill("#password", "password123");
  await client.click("button[type=submit]");
  await expect(client.getByText("This account has been suspended")).toBeVisible();
  await expect(client).toHaveURL(/\/login/);
});

test("an admin cancels a booking and the client is refunded in full", async ({ browser }) => {
  const email = uniqueEmail("cancel-client");
  const client = await openAs(browser);
  await signup(client, { name: "Cancel Client", email, role: "CLIENT" });
  await client.goto("/trainers");
  await client.getByRole("link", { name: /Lukas Becker/ }).click();
  await expect(client.getByRole("heading", { name: "Book a session" })).toBeVisible();
  await client.locator("form button[type=button]").first().click();
  await client.getByRole("button", { name: /Book/ }).click();
  await expect(client).toHaveURL(/\/dashboard\/bookings\//);

  const admin = await openAs(browser, "admin@example.com");
  await admin.goto(`/admin/bookings?q=${encodeURIComponent(email)}`);
  const booking = admin.getByRole("listitem", { name: "Booking Cancel Client with Lukas Becker" });
  await expect(booking.getByText("Confirmed", { exact: true })).toBeVisible();
  await booking.getByText("Cancel booking").click();
  await expect(booking.getByText("The client is refunded €60.00 in full.")).toBeVisible();
  await booking.getByLabel("Reason (optional)").fill("Trainer is unavailable that day");
  await booking.getByRole("button", { name: "Confirm cancellation" }).click();

  await expect(booking.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(booking.getByText(/Refunded €60\.00/)).toBeVisible();
  await expect(booking.getByText("Trainer is unavailable that day")).toBeVisible();
});
