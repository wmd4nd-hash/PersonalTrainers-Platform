/**
 * Public demo mode (DEMO_MODE=true): payments are simulated and everyone shares
 * the demo accounts, whose password is published. These helpers stop one
 * visitor locking the others out.
 */
export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

/** Accounts created by `npm run db:seed`. */
export const DEMO_ACCOUNT_EMAILS: readonly string[] = [
  "admin@example.com",
  "maya@example.com",
  "diego@example.com",
  "aiko@example.com",
  "lukas@example.com",
  "sofia@example.com",
  "omar@example.com",
  "client@example.com",
  "priya@example.com",
  "tom@example.com",
  "hannah@example.com",
  "marcus@example.com",
  "elena@example.com",
  "jamal@example.com",
  "chloe@example.com",
];

/** In demo mode, shared demo accounts can't have their password changed, be suspended or be locked. */
export function isProtectedDemoAccount(email: string) {
  return isDemoMode() && DEMO_ACCOUNT_EMAILS.includes(email.trim().toLowerCase());
}

export const DEMO_ACCOUNT_MESSAGE =
  "This is a shared demo account, so its password can't be changed. Sign up for your own account to try this.";
