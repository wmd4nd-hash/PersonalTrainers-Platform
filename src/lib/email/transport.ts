import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { after } from "next/server";
import type { EmailOutbox } from "@/generated/prisma/client";
import { db } from "../db";
import { site } from "../site";
import { appUrl } from "../stripe";
import type { EmailEnv } from "./layout";
import { redactSecrets } from "./redact";

/**
 * Email delivery. With SMTP_URL set, mail goes out over SMTP; without it the
 * app runs in "log mode": each email is marked sent and logged as one line, and
 * the full message stays readable in the admin outbox.
 */

export type EmailMessage = Pick<EmailOutbox, "to" | "subject" | "text" | "html">;

/** Links in emails point at APP_URL. */
export function emailEnv(): EmailEnv {
  return { appName: site.shortName, baseUrl: appUrl("/") };
}

export function emailMode(): "smtp" | "log" {
  return process.env.SMTP_URL ? "smtp" : "log";
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || `${site.shortName} <no-reply@${new URL(appUrl("/")).hostname}>`;
}

let transporter: Transporter | undefined;

function smtpTransport(url: string): Transporter {
  // Short timeouts: delivery holds a row lock while it talks to the server.
  transporter ??= nodemailer.createTransport({
    url,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/** Sends one email now. Throws if the SMTP server refuses it. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const url = process.env.SMTP_URL;
  if (!url) {
    console.info(`[email] log mode: "${message.subject}" to ${message.to}`);
    return;
  }
  await smtpTransport(url).sendMail({
    from: fromAddress(),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html || undefined,
  });
}

function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 1000) || "Unknown error";
}

type Outcome = "sent" | "failed";

/**
 * Sends the oldest queued email, if any. The row stays locked (FOR UPDATE SKIP
 * LOCKED) until it's marked SENT or FAILED, so concurrent workers never send
 * the same email twice and a crash mid-send leaves it QUEUED for a retry.
 */
async function deliverNext(): Promise<Outcome | null> {
  return db.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "EmailOutbox"
        WHERE "status" = 'QUEUED'
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      if (!row) return null;
      const email = await tx.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
      try {
        await sendEmail(email);
      } catch (err) {
        console.error(`[email] failed to send ${email.id}`, err);
        await tx.emailOutbox.update({
          where: { id: email.id },
          data: { status: "FAILED", error: describeError(err) },
        });
        return "failed";
      }
      await tx.emailOutbox.update({
        where: { id: email.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          error: "",
          // Delivered for real: the outbox copy no longer needs live reset links.
          // In log mode the outbox is the only way to read them, so they stay.
          ...(emailMode() === "smtp" && { text: redactSecrets(email.text), html: redactSecrets(email.html) }),
        },
      });
      return "sent";
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

/** Sends up to `limit` queued emails, oldest first. Safe to run concurrently. */
export async function deliverQueuedEmails(limit = 50): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  for (let i = 0; i < limit; i++) {
    const outcome = await deliverNext();
    if (!outcome) break;
    result[outcome]++;
  }
  return result;
}

// One delivery loop per server process; requests that queue mail while it runs
// ask it to go round again instead of starting another.
let running: Promise<void> | null = null;
let rerun = false;

function kickDelivery(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        rerun = false;
        await deliverQueuedEmails();
      } while (rerun);
    } catch (err) {
      console.error("[email] delivery failed; the deliver-email cron will retry", err);
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Delivers queued email once the current response has been sent, so pages and
 * actions never wait on SMTP. Outside a request (scripts, tests) it does
 * nothing and the /api/cron/deliver-email job picks the email up.
 */
export function deliverSoon(): void {
  try {
    after(kickDelivery);
  } catch {
    // Not inside a request scope.
  }
}
