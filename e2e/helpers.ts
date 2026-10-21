import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "password123";

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signup(page: Page, { name, email, role }: { name: string; email: string; role: "CLIENT" | "TRAINER" }) {
  await page.goto(`/signup?role=${role}`);
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", DEMO_PASSWORD);
  await page.click("button[type=submit]");
  await expect(page).not.toHaveURL(/\/signup/);
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
